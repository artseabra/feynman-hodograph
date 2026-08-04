import { normalizeAngle, TAU, type WedgeCrossing } from '../model/orbit';
import type { OrbitalState, SonificationLens } from '../types';

const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export interface OrbitalMeasures {
  angularMomentum: number;
  hodographRadius: number;
  hodographAngle: number;
  potential: number;
  potentialNormalized: number;
  kineticNormalized: number;
  radialVelocity: number;
}

/**
 * Dimensionless measures of the normalized two-body solution (a = μ = 1).
 * The values are intentionally exposed as a separate pure layer so the sound
 * score can be tested without an AudioContext.
 */
export function orbitalMeasures(state: OrbitalState): OrbitalMeasures {
  const e = state.eccentricity;
  const angularMomentum = Math.sqrt(Math.max(0, 1 - e * e));
  const hodographRadius = 1 / Math.max(angularMomentum, 1e-6);
  const hodographX = state.velocity.x;
  const hodographY = state.velocity.y - e * hodographRadius;
  const potential = 1 / Math.max(state.radius, 1e-6);
  const minimumPotential = 1 / (1 + e);
  const maximumPotential = 1 / Math.max(1e-6, 1 - e);
  const minimumKinetic = (1 - e) / (1 + e);
  const maximumKinetic = (1 + e) / Math.max(1e-6, 1 - e);
  const kinetic = state.speed * state.speed;

  return {
    angularMomentum,
    hodographRadius,
    hodographAngle: normalizeAngle(Math.atan2(hodographY, hodographX)),
    potential,
    potentialNormalized: e < 1e-6
      ? 0.5
      : clamp((potential - minimumPotential) / (maximumPotential - minimumPotential), 0, 1),
    kineticNormalized: e < 1e-6
      ? 0.5
      : clamp((kinetic - minimumKinetic) / (maximumKinetic - minimumKinetic), 0, 1),
    radialVelocity: (state.position.x * state.velocity.x + state.position.y * state.velocity.y)
      / Math.max(state.radius, 1e-6),
  };
}

export interface MarkerTuning {
  frequency: number;
  partials: readonly number[];
  intensity: number;
  duration: number;
  pan: number;
}

/**
 * Each equal-time boundary receives a pitch on the circle of fifths. Its
 * register, decay and partial balance are drawn from the exact orbital state
 * at the boundary—not from the display frame that happened to notice it.
 */
export function markerTuning(crossing: WedgeCrossing, state: OrbitalState): MarkerTuning {
  const measures = orbitalMeasures(state);
  const pitchClass = FIFTHS[crossing.index % FIFTHS.length];
  const register = Math.floor(crossing.index / FIFTHS.length);
  // The register starts above the laptop-speaker trough. The pitch classes,
  // timing, envelope, and changing partial balance still come from the
  // construction; this is an audibility choice, not an arbitrary sequence.
  const base = 220 * Math.pow(2, (measures.hodographRadius - 1) * 0.22);
  const frequency = clamp(base * Math.pow(2, (pitchClass + register * 12) / 12), 176, 1_600);
  const phasePan = Math.cos(measures.hodographAngle);

  return {
    frequency,
    partials: [
      1,
      0.3 + measures.kineticNormalized * 0.26,
      0.12 + measures.potentialNormalized * 0.18,
      0.05 + Math.min(0.14, Math.abs(measures.radialVelocity) * 0.12),
    ],
    intensity: 0.56 + measures.kineticNormalized * 0.44,
    duration: 0.46 + (1 - measures.potentialNormalized) * 0.42,
    // The continuous score remains centered; only discrete construction marks
    // are placed a little off-centre, following the hodograph itself.
    pan: clamp(phasePan * 0.18, -0.18, 0.18),
  };
}

export interface SonificationLensProfile {
  atmosphere: number;
  motion: number;
  markers: number;
  markerPitch: number;
}

export function sonificationLensProfile(lens: SonificationLens): SonificationLensProfile {
  switch (lens) {
    case 'hodograph':
      return { atmosphere: 0.74, motion: 1.12, markers: 0.84, markerPitch: Math.pow(2, 2 / 12) };
    case 'construction':
      return { atmosphere: 0.86, motion: 0.7, markers: 1.16, markerPitch: 1 };
    case 'keplerian':
    default:
      return { atmosphere: 1, motion: 1, markers: 1, markerPitch: 1 };
  }
}

export function hodographPhaseDegrees(state: OrbitalState): number {
  return orbitalMeasures(state).hodographAngle / TAU * 360;
}

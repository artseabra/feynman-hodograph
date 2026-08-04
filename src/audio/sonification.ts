import { normalizeAngle, TAU, type ApsisCrossing, type WedgeCrossing } from '../model/orbit';
import type { OrbitalState } from '../types';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export interface OrbitalMeasures {
  angularMomentum: number;
  hodographRadius: number;
  hodographAngle: number;
  potential: number;
  potentialNormalized: number;
  gravitationalField: number;
  gravitationalFieldNormalized: number;
  kineticNormalized: number;
  radialVelocity: number;
}

/**
 * Dimensionless measures of the normalized two-body solution (a = μ = 1).
 * The score maps these measures rather than the animation frame rate: gravity
 * is 1/r and 1/r²; the velocity stem is the phase of the actual hodograph.
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
  const gravitationalField = potential * potential;
  const minimumField = minimumPotential * minimumPotential;
  const maximumField = maximumPotential * maximumPotential;
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
    gravitationalField,
    gravitationalFieldNormalized: e < 1e-6
      ? 0.5
      : clamp((gravitationalField - minimumField) / (maximumField - minimumField), 0, 1),
    kineticNormalized: e < 1e-6
      ? 0.5
      : clamp((kinetic - minimumKinetic) / (maximumKinetic - minimumKinetic), 0, 1),
    radialVelocity: (state.position.x * state.velocity.x + state.position.y * state.velocity.y)
      / Math.max(state.radius, 1e-6),
  };
}

export interface GravityFrame {
  gain: number;
  brightness: number;
}

/**
 * Gravity is intentionally not pitch-mapped. A changing pitch makes distance
 * read as engine RPM; here proximity opens the spectrum and raises density.
 */
export function gravityFrame(state: OrbitalState): GravityFrame {
  const measures = orbitalMeasures(state);
  return {
    gain: 0.18 + measures.gravitationalFieldNormalized * 0.82,
    brightness: 0.16 + measures.gravitationalFieldNormalized * 0.84,
  };
}

export interface HodographFrame {
  /** One non-negative projection for each cardinal direction of the circle. */
  weights: readonly [number, number, number, number];
  gain: number;
  brightness: number;
}

/**
 * Four stationary resonators are crossfaded by the normalized velocity vector
 * itself. This makes the circular hodograph a timbral path, not a continuously
 * accelerating oscillator or a moving-engine imitation.
 */
export function hodographFrame(state: OrbitalState): HodographFrame {
  const measures = orbitalMeasures(state);
  const angle = measures.hodographAngle;
  const raw = [
    Math.max(0, Math.cos(angle)),
    Math.max(0, Math.sin(angle)),
    Math.max(0, -Math.cos(angle)),
    Math.max(0, -Math.sin(angle)),
  ] as const;
  const sum = raw.reduce((total, value) => total + value, 0) || 1;
  return {
    weights: [raw[0] / sum, raw[1] / sum, raw[2] / sum, raw[3] / sum],
    gain: 0.24 + measures.kineticNormalized * 0.76,
    brightness: 0.2 + measures.kineticNormalized * 0.8,
  };
}

export interface MarkerTuning {
  frequency: number;
  overtone: number;
  intensity: number;
  duration: number;
}

const HODOGRAPH_SCALE = [0, 2, 3, 5, 7, 9, 10, 12] as const;

/**
 * Equal-time boundaries receive pitches drawn from the angle around the
 * hodograph circle. The cycle is therefore spatially closed: a full circuit
 * returns to its opening pitch without an arbitrary index-based sequence.
 */
export function markerTuning(_crossing: WedgeCrossing, state: OrbitalState): MarkerTuning {
  const measures = orbitalMeasures(state);
  const step = Math.min(HODOGRAPH_SCALE.length - 1, Math.floor(measures.hodographAngle / TAU * HODOGRAPH_SCALE.length));
  const frequency = 293.6648 * Math.pow(2, HODOGRAPH_SCALE[step] / 12);
  return {
    frequency: clamp(frequency, 220, 880),
    overtone: 2 + (measures.kineticNormalized > 0.64 ? 0.01 : -0.01),
    intensity: 0.64 + measures.kineticNormalized * 0.36,
    duration: 0.2 + (1 - measures.potentialNormalized) * 0.18,
  };
}

export function apsisTuning(kind: ApsisCrossing['kind'], state: OrbitalState): MarkerTuning {
  void state;
  const perihelion = kind === 'perihelion';
  return {
    frequency: perihelion ? 493.8833 : 329.6276,
    overtone: perihelion ? 1.5 : 2,
    intensity: perihelion ? 0.96 : 0.74,
    duration: perihelion ? 0.62 : 0.48,
  };
}

export function hodographPhaseDegrees(state: OrbitalState): number {
  return orbitalMeasures(state).hodographAngle / TAU * 360;
}

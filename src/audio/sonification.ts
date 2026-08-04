import { normalizeAngle, TAU, type ApsisCrossing, type WedgeCrossing } from '../model/orbit';
import type { OrbitalState } from '../types';
import { gravityFieldFrame } from './gravityVoice';

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
 * The score maps these measures rather than the animation frame rate: the
 * continuous gravity stem reads 1/r², marker decay also reads potential 1/r,
 * and the velocity stem follows the phase of the actual hodograph.
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
  return gravityFieldFrame(measures.gravitationalFieldNormalized);
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

export interface BoundaryPulse {
  frequency: number;
  modeRatio: number;
  intensity: number;
  duration: number;
}

/**
 * Equal-time boundaries use one dry, damped physical pulse rather than noise
 * or a pitched sequence. Its two inharmonic modes change continuously around
 * the hodograph, while proximity sets damping and velocity sets weight.
 */
export function boundaryPulse(_crossing: WedgeCrossing, state: OrbitalState): BoundaryPulse {
  const measures = orbitalMeasures(state);
  const angle = measures.hodographAngle;

  return {
    frequency: 202
      + 11 * Math.sin(angle)
      + 6 * Math.sin(angle * 2 + Math.PI / 4),
    modeRatio: 1.48 + 0.18 * (0.5 + 0.5 * Math.cos(angle * 2 - Math.PI / 5)),
    intensity: 0.62 + measures.kineticNormalized * 0.32,
    duration: 0.072 + (1 - measures.potentialNormalized) * 0.05,
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

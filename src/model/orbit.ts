import type { EqualTimeSample, OrbitalState, Point2 } from '../types';

export const TAU = Math.PI * 2;
export const MAX_ECCENTRICITY = 0.85;

export interface WedgeCrossing {
  /** The shared orbital/hodograph wedge index, wrapped to [0, N). */
  index: number;
  /** The number of equal-time wedges in the active construction. */
  wedgeCount: number;
  /** The completed orbital revolution that contains this boundary. */
  cycle: number;
  /** Unwrapped mean anomaly at the exact equal-time boundary. */
  meanAnomaly: number;
}

export interface ApsisCrossing {
  kind: 'perihelion' | 'aphelion';
  cycle: number;
  /** Unwrapped mean anomaly at the exact apsis. */
  meanAnomaly: number;
}

export function normalizeAngle(angle: number): number {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

export function clampEccentricity(eccentricity: number): number {
  if (!Number.isFinite(eccentricity)) return 0;
  return Math.min(MAX_ECCENTRICITY, Math.max(0, eccentricity));
}

export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  const e = clampEccentricity(eccentricity);
  const m = normalizeAngle(meanAnomaly);
  let eccentricAnomaly = e < 0.8 ? m : Math.PI;

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const residual = eccentricAnomaly - e * Math.sin(eccentricAnomaly) - m;
    const slope = 1 - e * Math.cos(eccentricAnomaly);
    const delta = residual / slope;
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }

  return eccentricAnomaly;
}

export function orbitalState(eccentricity: number, meanAnomaly: number): OrbitalState {
  const e = clampEccentricity(eccentricity);
  const m = normalizeAngle(meanAnomaly);
  const eccentricAnomaly = solveKepler(m, e);
  const root = Math.sqrt(1 - e * e);
  const denominator = 1 - e * Math.cos(eccentricAnomaly);
  const position: Point2 = {
    x: Math.cos(eccentricAnomaly) - e,
    y: root * Math.sin(eccentricAnomaly),
  };
  const velocity: Point2 = {
    x: -Math.sin(eccentricAnomaly) / denominator,
    y: root * Math.cos(eccentricAnomaly) / denominator,
  };
  const trueAnomaly = Math.atan2(position.y, position.x);

  return {
    eccentricity: e,
    meanAnomaly: m,
    eccentricAnomaly,
    trueAnomaly,
    position,
    velocity,
    radius: Math.hypot(position.x, position.y),
    speed: Math.hypot(velocity.x, velocity.y),
  };
}

export function equalTimeSamples(eccentricity: number, wedges: number): EqualTimeSample[] {
  const count = Math.max(3, Math.round(wedges));
  return Array.from({ length: count }, (_, index) => ({
    ...orbitalState(eccentricity, (index / count) * TAU),
    index,
  }));
}

export function hodographCircle(eccentricity: number): { center: Point2; radius: number } {
  const e = clampEccentricity(eccentricity);
  const scale = 1 / Math.sqrt(1 - e * e);
  return {
    center: { x: 0, y: e * scale },
    radius: scale,
  };
}

export function hodographDistanceFromCircle(state: OrbitalState): number {
  const circle = hodographCircle(state.eccentricity);
  return Math.hypot(state.velocity.x - circle.center.x, state.velocity.y - circle.center.y);
}

export function crossedWedgeEvents(previousMeanAnomaly: number, nextMeanAnomaly: number, wedges: number): WedgeCrossing[] {
  const count = Math.max(3, Math.round(wedges));
  if (!Number.isFinite(previousMeanAnomaly) || !Number.isFinite(nextMeanAnomaly)) return [];
  if (nextMeanAnomaly <= previousMeanAnomaly) return [];

  const step = TAU / count;
  const first = Math.floor(previousMeanAnomaly / step) + 1;
  const last = Math.floor(nextMeanAnomaly / step);
  const crossings: WedgeCrossing[] = [];

  for (let boundary = first; boundary <= last; boundary += 1) {
    crossings.push({
      index: ((boundary % count) + count) % count,
      wedgeCount: count,
      cycle: Math.floor(boundary / count),
      meanAnomaly: boundary * step,
    });
  }

  return crossings;
}

export function crossedWedgeIndices(previousMeanAnomaly: number, nextMeanAnomaly: number, wedges: number): number[] {
  return crossedWedgeEvents(previousMeanAnomaly, nextMeanAnomaly, wedges).map(event => event.index);
}

export function crossedApsisEvents(previousMeanAnomaly: number, nextMeanAnomaly: number): ApsisCrossing[] {
  if (!Number.isFinite(previousMeanAnomaly) || !Number.isFinite(nextMeanAnomaly)) return [];
  if (nextMeanAnomaly <= previousMeanAnomaly) return [];

  const crossings: ApsisCrossing[] = [];
  const include = (phase: number, kind: ApsisCrossing['kind']) => {
    const first = Math.floor((previousMeanAnomaly - phase) / TAU) + 1;
    const last = Math.floor((nextMeanAnomaly - phase) / TAU);
    for (let cycle = first; cycle <= last; cycle += 1) {
      crossings.push({ kind, cycle, meanAnomaly: phase + cycle * TAU });
    }
  };

  include(0, 'perihelion');
  include(Math.PI, 'aphelion');
  return crossings.sort((first, second) => first.meanAnomaly - second.meanAnomaly);
}

import type { OrbitalState, Point2, Point3 } from '../types';
import { normalizeAngle, TAU } from './orbit';

// Position space and velocity space are different vector spaces. This is a
// deliberate spatial embedding: the orbital construction lies horizontally,
// while the hodograph stands in a vertical plane. Their shared phase is drawn
// as a correspondence bridge rather than faking a single flat dashboard.
const ORBIT_ORIGIN: Point3 = { x: -1.85, y: -0.58, z: 0.98 };
const HODOGRAPH_ORIGIN: Point3 = { x: 1.85, y: 0.18, z: -1.32 };
const ORBIT_SCALE = 2.2;
const HODOGRAPH_SCALE = 1.25;
// The grid is a construction field, not a second scene. Keep it close to the
// ellipse so it supplies depth and measurement without turning the proof into
// a tiny object marooned in empty tabletop.
const ORBIT_GRID_EXTENT = 1.85;

export const sceneLayout = {
  orbitOrigin: ORBIT_ORIGIN,
  hodographOrigin: HODOGRAPH_ORIGIN,
  orbitScale: ORBIT_SCALE,
  hodographScale: HODOGRAPH_SCALE,
  orbitGridExtent: ORBIT_GRID_EXTENT,
};

export function orbitWorld(point: Point2, elevation = 0): Point3 {
  return {
    x: ORBIT_ORIGIN.x + point.x * ORBIT_SCALE,
    y: ORBIT_ORIGIN.y + elevation,
    z: ORBIT_ORIGIN.z + point.y * ORBIT_SCALE,
  };
}

export function hodographWorld(point: Point2, depth = 0): Point3 {
  return {
    x: HODOGRAPH_ORIGIN.x + point.x * HODOGRAPH_SCALE,
    y: HODOGRAPH_ORIGIN.y + point.y * HODOGRAPH_SCALE,
    z: HODOGRAPH_ORIGIN.z + depth,
  };
}

export function hodographGridExtent(topOfCircle: number): number {
  return Math.max(2.55, topOfCircle + 0.5);
}

export function activeWedgeIndex(meanAnomaly: number, wedges: number): number {
  const count = Math.max(3, Math.round(wedges));
  return Math.min(count - 1, Math.floor(normalizeAngle(meanAnomaly) / TAU * count));
}

export function correspondenceBridge(state: OrbitalState): Point3[] {
  const orbit = orbitWorld(state.position, 0.16);
  const hodograph = hodographWorld(state.velocity, 0.16);
  const lift = Math.max(orbit.y, hodograph.y) + 0.72;
  const firstBend: Point3 = {
    x: orbit.x + (hodograph.x - orbit.x) * 0.3,
    y: lift,
    z: orbit.z + (hodograph.z - orbit.z) * 0.16,
  };
  const secondBend: Point3 = {
    x: orbit.x + (hodograph.x - orbit.x) * 0.72,
    y: lift,
    z: orbit.z + (hodograph.z - orbit.z) * 0.84,
  };
  return [orbit, firstBend, secondBend, hodograph];
}

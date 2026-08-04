import type { OrbitalState, Point2, Point3 } from '../types';
import { hodographCircle, normalizeAngle, TAU } from './orbit';

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
// The grids are measurement surfaces, not blank tabletops. They are framed
// around the actual ellipse / hodograph rather than around their local
// origins, so the proof can occupy the stage without sacrificing any visible
// construction.
const ORBIT_GRID_EXTENT = 1.36;
const ORBIT_GRID_MARGIN = 0.36;
const HODOGRAPH_GRID_MARGIN = 0.42;

export const sceneLayout = {
  orbitOrigin: ORBIT_ORIGIN,
  hodographOrigin: HODOGRAPH_ORIGIN,
  orbitScale: ORBIT_SCALE,
  hodographScale: HODOGRAPH_SCALE,
  orbitGridExtent: ORBIT_GRID_EXTENT,
};

export interface GridFrame {
  center: Point2;
  extent: number;
}

export function orbitGridFrame(eccentricity: number): GridFrame {
  return {
    // The ellipse and reference circle are centred at x = −e. The Sun stays
    // visibly inside this frame for every supported eccentricity.
    center: { x: -eccentricity, y: 0 },
    extent: 1 + ORBIT_GRID_MARGIN,
  };
}

export function hodographGridFrame(eccentricity: number): GridFrame {
  const circle = hodographCircle(eccentricity);
  return {
    // Center the vertical sheet on the displaced circle while retaining the
    // velocity origin inside it. The offset is therefore legible, not lost in
    // a large empty lower half of the canvas.
    center: circle.center,
    extent: circle.radius + HODOGRAPH_GRID_MARGIN,
  };
}

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

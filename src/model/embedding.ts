import type { ConstructionLayout, OrbitalState, Point2, Point3 } from '../types';
import { hodographCircle, normalizeAngle, TAU } from './orbit';

export type { ConstructionLayout } from '../types';

// Position space and velocity space are different vector spaces. This is a
// deliberate spatial embedding: the orbital construction lies horizontally,
// while the hodograph stands in a vertical plane. Their shared phase is drawn
// as a correspondence bridge rather than faking a single flat dashboard.
const WORLD_ORIGIN: Point3 = { x: 0, y: 0, z: 0 };
const MERGED_ORBIT_ORIGIN: Point3 = WORLD_ORIGIN;
const MERGED_HODOGRAPH_ORIGIN: Point3 = WORLD_ORIGIN;
// These are the authored positions from the last separated composition before
// the shared-origin restoration (b855f19). In this mode the local vectors are
// intentionally left focus/origin-relative, exactly as they were there.
const SEPARATED_ORBIT_ORIGIN: Point3 = { x: -1.85, y: -0.58, z: 0.98 };
const SEPARATED_HODOGRAPH_ORIGIN: Point3 = { x: 1.85, y: 0.18, z: -1.32 };
const ORBIT_SCALE = 2.2;
const HODOGRAPH_DISPLAY_RADIUS = 1.45;
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
  orbitOrigin: MERGED_ORBIT_ORIGIN,
  hodographOrigin: MERGED_HODOGRAPH_ORIGIN,
  separatedOrbitOrigin: SEPARATED_ORBIT_ORIGIN,
  separatedHodographOrigin: SEPARATED_HODOGRAPH_ORIGIN,
  orbitScale: ORBIT_SCALE,
  hodographDisplayRadius: HODOGRAPH_DISPLAY_RADIUS,
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

export function orbitWorld(
  point: Point2,
  eccentricity: number,
  elevation = 0,
  layout: ConstructionLayout = 'merged',
): Point3 {
  if (layout === 'separated') {
    return {
      x: SEPARATED_ORBIT_ORIGIN.x + point.x * ORBIT_SCALE,
      y: SEPARATED_ORBIT_ORIGIN.y + elevation,
      z: SEPARATED_ORBIT_ORIGIN.z + point.y * ORBIT_SCALE,
    };
  }
  return {
    // orbitalState is focus-relative; +e places the ellipse's geometric
    // centre at Blender-style world zero while the Sun remains at its focus.
    x: MERGED_ORBIT_ORIGIN.x + (point.x + eccentricity) * ORBIT_SCALE,
    y: MERGED_ORBIT_ORIGIN.y + elevation,
    z: MERGED_ORBIT_ORIGIN.z + point.y * ORBIT_SCALE,
  };
}

/**
 * Position and velocity have different units, so a literal shared-world scale
 * has no physical meaning. Keep the displayed hodograph radius stable while
 * preserving every within-plane relation—especially offset / radius = e.
 */
export function hodographDisplayScale(eccentricity: number): number {
  return HODOGRAPH_DISPLAY_RADIUS / hodographCircle(eccentricity).radius;
}

export function hodographWorld(
  point: Point2,
  eccentricity: number,
  depth = 0,
  layout: ConstructionLayout = 'merged',
): Point3 {
  const scale = hodographDisplayScale(eccentricity);
  if (layout === 'separated') {
    return {
      x: SEPARATED_HODOGRAPH_ORIGIN.x + point.x * scale,
      y: SEPARATED_HODOGRAPH_ORIGIN.y + point.y * scale,
      z: SEPARATED_HODOGRAPH_ORIGIN.z + depth,
    };
  }
  const circle = hodographCircle(eccentricity);
  return {
    x: MERGED_HODOGRAPH_ORIGIN.x + (point.x - circle.center.x) * scale,
    // Centre the circle itself at world zero. The velocity origin remains
    // displaced downward, so offset / radius = e stays visually explicit.
    y: MERGED_HODOGRAPH_ORIGIN.y + (point.y - circle.center.y) * scale,
    z: MERGED_HODOGRAPH_ORIGIN.z + depth,
  };
}

export function activeWedgeIndex(meanAnomaly: number, wedges: number): number {
  const count = Math.max(3, Math.round(wedges));
  return Math.min(count - 1, Math.floor(normalizeAngle(meanAnomaly) / TAU * count));
}

export function correspondenceBridge(
  state: OrbitalState,
  layout: ConstructionLayout = 'merged',
): Point3[] {
  const orbit = orbitWorld(state.position, state.eccentricity, 0.16, layout);
  const hodograph = hodographWorld(state.velocity, state.eccentricity, 0.16, layout);
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

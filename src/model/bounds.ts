import type { Point3, SceneBounds } from '../types';
import { correspondenceBridge, hodographGridFrame, hodographWorld, orbitGridFrame, orbitWorld } from './embedding';
import { clampEccentricity, equalTimeSamples, hodographCircle, orbitalState, TAU } from './orbit';

export { sceneLayout } from './embedding';

class BoundsAccumulator {
  private min = { x: Infinity, y: Infinity, z: Infinity };
  private max = { x: -Infinity, y: -Infinity, z: -Infinity };

  include(point: Point3, padding = 0): void {
    this.min.x = Math.min(this.min.x, point.x - padding);
    this.min.y = Math.min(this.min.y, point.y - padding);
    this.min.z = Math.min(this.min.z, point.z - padding);
    this.max.x = Math.max(this.max.x, point.x + padding);
    this.max.y = Math.max(this.max.y, point.y + padding);
    this.max.z = Math.max(this.max.z, point.z + padding);
  }

  finish(): SceneBounds {
    const center = {
      x: (this.min.x + this.max.x) / 2,
      y: (this.min.y + this.max.y) / 2,
      z: (this.min.z + this.max.z) / 2,
    };
    const size = {
      x: this.max.x - this.min.x,
      y: this.max.y - this.min.y,
      z: this.max.z - this.min.z,
    };
    return {
      min: this.min,
      max: this.max,
      center,
      size,
      radius: Math.max(1, Math.hypot(size.x, size.y, size.z) / 2),
    };
  }
}

function includeGrid(bounds: BoundsAccumulator, eccentricity: number): void {
  const orbitGrid = orbitGridFrame(eccentricity);
  [-orbitGrid.extent, orbitGrid.extent].forEach(x => {
    [-orbitGrid.extent, orbitGrid.extent].forEach(y => bounds.include(orbitWorld({
      x: orbitGrid.center.x + x,
      y: orbitGrid.center.y + y,
    }, -0.14), 0.08));
  });

  const hodographGrid = hodographGridFrame(eccentricity);
  [-hodographGrid.extent, hodographGrid.extent].forEach(x => {
    [-hodographGrid.extent, hodographGrid.extent].forEach(y => bounds.include(hodographWorld({
      x: hodographGrid.center.x + x,
      y: hodographGrid.center.y + y,
    }, -0.14), 0.08));
  });
}

export function computeInstrumentBounds(eccentricity: number, wedges: number): SceneBounds {
  const bounds = new BoundsAccumulator();
  const e = clampEccentricity(eccentricity);
  const samples = equalTimeSamples(e, wedges);

  // The full ellipse, its reference circle, and the full hodograph must remain
  // in frame at every valid eccentricity—not merely the equal-time samples.
  for (let index = 0; index <= 192; index += 1) {
    const anomaly = index / 192 * TAU;
    const state = orbitalState(e, anomaly);
    bounds.include(orbitWorld(state.position), 0.2);
    bounds.include(hodographWorld(state.velocity), 0.2);
    bounds.include(orbitWorld({ x: Math.cos(anomaly) - e, y: Math.sin(anomaly) }), 0.1);
  }

  bounds.include(orbitWorld({ x: 0, y: 0 }, 0.22), 0.24);
  const circle = hodographCircle(e);
  bounds.include(hodographWorld({ x: 0, y: 0 }, 0.12), 0.16);
  bounds.include(hodographWorld(circle.center, 0.12), 0.16);

  samples.forEach(sample => {
    correspondenceBridge(sample).forEach(point => bounds.include(point, 0.16));
  });
  includeGrid(bounds, e);
  return bounds.finish();
}

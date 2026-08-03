import type { Point3, SceneBounds } from '../types';
import { clampEccentricity, equalTimeSamples, hodographCircle } from './orbit';

const POSITION_OFFSET = { x: -3.7, y: 0, z: 0.55 };
const HODOGRAPH_OFFSET = { x: 3.7, y: 0, z: -0.55 };
const POSITION_SCALE = 1.9;
const HODOGRAPH_SCALE = 1.35;
const LABEL_MARGIN = 0.55;

export const sceneLayout = {
  positionOffset: POSITION_OFFSET,
  hodographOffset: HODOGRAPH_OFFSET,
  positionScale: POSITION_SCALE,
  hodographScale: HODOGRAPH_SCALE,
};

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

  includeCircle(center: Point3, radius: number, depth = 0.08): void {
    this.include({ x: center.x - radius, y: center.y - radius, z: center.z }, depth);
    this.include({ x: center.x + radius, y: center.y + radius, z: center.z }, depth);
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

export function computeInstrumentBounds(eccentricity: number, wedges: number): SceneBounds {
  const bounds = new BoundsAccumulator();
  const e = clampEccentricity(eccentricity);
  const samples = equalTimeSamples(e, wedges);

  samples.forEach(sample => {
    bounds.include({
      x: POSITION_OFFSET.x + sample.position.x * POSITION_SCALE,
      y: POSITION_OFFSET.y + sample.position.y * POSITION_SCALE,
      z: POSITION_OFFSET.z,
    }, 0.16);
    bounds.include({
      x: HODOGRAPH_OFFSET.x + sample.velocity.x * HODOGRAPH_SCALE,
      y: HODOGRAPH_OFFSET.y + sample.velocity.y * HODOGRAPH_SCALE,
      z: HODOGRAPH_OFFSET.z,
    }, 0.16);
  });

  const auxiliaryCenter = {
    x: POSITION_OFFSET.x + e * POSITION_SCALE,
    y: POSITION_OFFSET.y,
    z: POSITION_OFFSET.z,
  };
  bounds.includeCircle(auxiliaryCenter, POSITION_SCALE, 0.12);
  bounds.include({ x: POSITION_OFFSET.x, y: POSITION_OFFSET.y, z: POSITION_OFFSET.z }, LABEL_MARGIN);

  const circle = hodographCircle(e);
  bounds.includeCircle({
    x: HODOGRAPH_OFFSET.x + circle.center.x * HODOGRAPH_SCALE,
    y: HODOGRAPH_OFFSET.y + circle.center.y * HODOGRAPH_SCALE,
    z: HODOGRAPH_OFFSET.z,
  }, circle.radius * HODOGRAPH_SCALE, 0.12);
  bounds.include({ x: HODOGRAPH_OFFSET.x, y: HODOGRAPH_OFFSET.y, z: HODOGRAPH_OFFSET.z }, LABEL_MARGIN);

  // The grid and caption reserve are renderable scene geometry too. Including
  // them prevents a mathematically complete curve from fitting while its frame
  // is still cropped at a canonical camera view.
  bounds.include({ x: POSITION_OFFSET.x - 2.35, y: POSITION_OFFSET.y - 2.35, z: POSITION_OFFSET.z - 0.16 });
  bounds.include({ x: POSITION_OFFSET.x + 2.35, y: POSITION_OFFSET.y + 2.35, z: POSITION_OFFSET.z + 0.24 });
  bounds.include({ x: HODOGRAPH_OFFSET.x - 2.9, y: HODOGRAPH_OFFSET.y - 2.9, z: HODOGRAPH_OFFSET.z - 0.16 });
  bounds.include({ x: HODOGRAPH_OFFSET.x + 2.9, y: HODOGRAPH_OFFSET.y + 2.9, z: HODOGRAPH_OFFSET.z + 0.24 });

  return bounds.finish();
}

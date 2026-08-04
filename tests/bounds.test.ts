import { describe, expect, it } from 'vitest';
import { computeInstrumentBounds } from '../src/model/bounds';
import { correspondenceBridge, hodographGridFrame, hodographWorld, orbitGridFrame, orbitWorld } from '../src/model/embedding';
import { equalTimeSamples, MAX_ECCENTRICITY, orbitalState, TAU } from '../src/model/orbit';

function expectContained(
  bounds: ReturnType<typeof computeInstrumentBounds>,
  point: { x: number; y: number; z: number },
): void {
  expect(bounds.min.x).toBeLessThanOrEqual(point.x);
  expect(bounds.max.x).toBeGreaterThanOrEqual(point.x);
  expect(bounds.min.y).toBeLessThanOrEqual(point.y);
  expect(bounds.max.y).toBeGreaterThanOrEqual(point.y);
  expect(bounds.min.z).toBeLessThanOrEqual(point.z);
  expect(bounds.max.z).toBeGreaterThanOrEqual(point.z);
}

describe('spatial bounds and correspondence', () => {
  it.each([0, 0.55, MAX_ECCENTRICITY])('contains the full embedded construction at e = %s', eccentricity => {
    const bounds = computeInstrumentBounds(eccentricity, 16);
    for (let index = 0; index <= 64; index += 1) {
      const state = orbitalState(eccentricity, index / 64 * TAU);
      expectContained(bounds, orbitWorld(state.position));
      expectContained(bounds, hodographWorld(state.velocity));
      correspondenceBridge(state).forEach(point => expectContained(bounds, point));
    }
    expect(bounds.radius).toBeGreaterThan(0);
  });

  it('embeds position and velocity in orthogonal spatial planes', () => {
    const orbitOrigin = orbitWorld({ x: 0, y: 0 });
    const orbitYDirection = orbitWorld({ x: 0, y: 1 });
    const hodographOrigin = hodographWorld({ x: 0, y: 0 });
    const hodographYDirection = hodographWorld({ x: 0, y: 1 });

    expect(orbitYDirection.z).not.toBe(orbitOrigin.z);
    expect(orbitYDirection.y).toBe(orbitOrigin.y);
    expect(hodographYDirection.y).not.toBe(hodographOrigin.y);
    expect(hodographYDirection.z).toBe(hodographOrigin.z);
  });

  it('contains both physical grids and every equal-time correspondence bridge', () => {
    const eccentricity = MAX_ECCENTRICITY;
    const bounds = computeInstrumentBounds(eccentricity, 36);
    const orbitGrid = orbitGridFrame(eccentricity);
    const hodographGrid = hodographGridFrame(eccentricity);
    expectContained(bounds, orbitWorld({
      x: orbitGrid.center.x - orbitGrid.extent,
      y: orbitGrid.center.y - orbitGrid.extent,
    }, -0.14));
    expectContained(bounds, orbitWorld({
      x: orbitGrid.center.x + orbitGrid.extent,
      y: orbitGrid.center.y + orbitGrid.extent,
    }, -0.14));
    expectContained(bounds, hodographWorld({
      x: hodographGrid.center.x - hodographGrid.extent,
      y: hodographGrid.center.y - hodographGrid.extent,
    }, -0.14));
    expectContained(bounds, hodographWorld({
      x: hodographGrid.center.x + hodographGrid.extent,
      y: hodographGrid.center.y + hodographGrid.extent,
    }, -0.14));
    equalTimeSamples(eccentricity, 36).forEach(sample => {
      correspondenceBridge(sample).forEach(point => expectContained(bounds, point));
    });
  });
});

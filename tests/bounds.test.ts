import { describe, expect, it } from 'vitest';
import { computeInstrumentBounds } from '../src/model/bounds';
import {
  correspondenceBridge,
  hodographDisplayScale,
  hodographGridFrame,
  hodographWorld,
  orbitGridFrame,
  orbitWorld,
  sceneLayout,
  type ConstructionLayout,
} from '../src/model/embedding';
import { equalTimeSamples, hodographCircle, MAX_ECCENTRICITY, orbitalState, TAU } from '../src/model/orbit';

const LAYOUTS: ConstructionLayout[] = ['merged', 'separated'];
const ECCENTRICITIES = [0, 0.55, MAX_ECCENTRICITY];
const LAYOUT_CASES = LAYOUTS.flatMap(layout => (
  ECCENTRICITIES.map(eccentricity => ({ layout, eccentricity }))
));

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

function expectPointClose(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
  expect(actual.z).toBeCloseTo(expected.z, 12);
}

describe('spatial bounds and correspondence', () => {
  it.each(LAYOUT_CASES)(
    'contains the full $layout construction at e = $eccentricity',
    ({ layout, eccentricity }) => {
      const bounds = computeInstrumentBounds(eccentricity, 16, layout);
      for (let index = 0; index <= 64; index += 1) {
        const state = orbitalState(eccentricity, index / 64 * TAU);
        expectContained(bounds, orbitWorld(state.position, eccentricity, 0, layout));
        expectContained(bounds, hodographWorld(state.velocity, eccentricity, 0, layout));
        correspondenceBridge(state, layout).forEach(point => expectContained(bounds, point));
      }
      expect(bounds.radius).toBeGreaterThan(0);
    },
  );

  it.each(LAYOUTS)('embeds position and velocity in orthogonal spatial planes when %s', layout => {
    const orbitOrigin = orbitWorld({ x: 0, y: 0 }, 0, 0, layout);
    const orbitYDirection = orbitWorld({ x: 0, y: 1 }, 0, 0, layout);
    const hodographOrigin = hodographWorld({ x: 0, y: 0 }, 0, 0, layout);
    const hodographYDirection = hodographWorld({ x: 0, y: 1 }, 0, 0, layout);

    expect(orbitYDirection.z).not.toBe(orbitOrigin.z);
    expect(orbitYDirection.y).toBe(orbitOrigin.y);
    expect(hodographYDirection.y).not.toBe(hodographOrigin.y);
    expect(hodographYDirection.z).toBe(hodographOrigin.z);
  });

  it.each(LAYOUTS)('contains both physical grids and every equal-time bridge when %s', layout => {
    const eccentricity = MAX_ECCENTRICITY;
    const bounds = computeInstrumentBounds(eccentricity, 36, layout);
    const orbitGrid = orbitGridFrame(eccentricity);
    const hodographGrid = hodographGridFrame(eccentricity);
    expectContained(bounds, orbitWorld({
      x: orbitGrid.center.x - orbitGrid.extent,
      y: orbitGrid.center.y - orbitGrid.extent,
    }, eccentricity, -0.14, layout));
    expectContained(bounds, orbitWorld({
      x: orbitGrid.center.x + orbitGrid.extent,
      y: orbitGrid.center.y + orbitGrid.extent,
    }, eccentricity, -0.14, layout));
    expectContained(bounds, hodographWorld({
      x: hodographGrid.center.x - hodographGrid.extent,
      y: hodographGrid.center.y - hodographGrid.extent,
    }, eccentricity, -0.14, layout));
    expectContained(bounds, hodographWorld({
      x: hodographGrid.center.x + hodographGrid.extent,
      y: hodographGrid.center.y + hodographGrid.extent,
    }, eccentricity, -0.14, layout));
    equalTimeSamples(eccentricity, 36).forEach(sample => {
      correspondenceBridge(sample, layout).forEach(point => expectContained(bounds, point));
    });
  });

  it.each(LAYOUT_CASES)(
    'keeps a stable displayed hodograph radius and preserves e when $layout at $eccentricity',
    ({ layout, eccentricity }) => {
      const circle = hodographCircle(eccentricity);
      const origin = hodographWorld({ x: 0, y: 0 }, eccentricity, 0, layout);
      const center = hodographWorld(circle.center, eccentricity, 0, layout);
      const edge = hodographWorld({
        x: circle.center.x + circle.radius,
        y: circle.center.y,
      }, eccentricity, 0, layout);
      const displayRadius = Math.abs(edge.x - center.x);
      const displayOffset = Math.abs(center.y - origin.y);

      expect(displayRadius).toBeCloseTo(sceneLayout.hodographDisplayRadius, 12);
      expect(displayOffset / displayRadius).toBeCloseTo(eccentricity, 12);
    },
  );

  it.each([0, 0.55, MAX_ECCENTRICITY])('aligns both geometric centres at world zero for e = %s', eccentricity => {
    const circle = hodographCircle(eccentricity);
    const orbitCenter = orbitWorld({ x: -eccentricity, y: 0 }, eccentricity);
    const hodographCenter = hodographWorld(circle.center, eccentricity);

    expect(orbitCenter).toEqual({ x: 0, y: 0, z: 0 });
    expect(hodographCenter).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('reproduces the authored pre-merge transforms in separated mode', () => {
    const eccentricity = 0.55;
    const point = { x: 0.4, y: -0.2 };
    const scale = hodographDisplayScale(eccentricity);

    expectPointClose(
      orbitWorld(point, eccentricity, 0.3, 'separated'),
      {
        x: -1.85 + point.x * 2.2,
        y: -0.58 + 0.3,
        z: 0.98 + point.y * 2.2,
      },
    );
    expectPointClose(
      hodographWorld(point, eccentricity, 0.3, 'separated'),
      {
        x: 1.85 + point.x * scale,
        y: 0.18 + point.y * scale,
        z: -1.32 + 0.3,
      },
    );
    expect(sceneLayout.separatedOrbitOrigin).toEqual({ x: -1.85, y: -0.58, z: 0.98 });
    expect(sceneLayout.separatedHodographOrigin).toEqual({ x: 1.85, y: 0.18, z: -1.32 });
  });

  it.each(LAYOUTS)('keeps the orange and blue bridge endpoints synchronized when %s', layout => {
    const state = orbitalState(MAX_ECCENTRICITY, 1.73);
    const bridge = correspondenceBridge(state, layout);

    expectPointClose(
      bridge[0],
      orbitWorld(state.position, state.eccentricity, 0.16, layout),
    );
    expectPointClose(
      bridge[bridge.length - 1],
      hodographWorld(state.velocity, state.eccentricity, 0.16, layout),
    );
  });
});

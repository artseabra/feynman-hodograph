import { describe, expect, it } from 'vitest';
import { computeInstrumentBounds, sceneLayout } from '../src/model/bounds';
import { hodographCircle, MAX_ECCENTRICITY } from '../src/model/orbit';

describe('dynamic scene bounds', () => {
  it.each([0, 0.55, MAX_ECCENTRICITY])('contains the full construction at e = %s', eccentricity => {
    const bounds = computeInstrumentBounds(eccentricity, 16);
    const auxiliaryMaximum = sceneLayout.positionOffset.x + (eccentricity + 1) * sceneLayout.positionScale;
    const auxiliaryMinimum = sceneLayout.positionOffset.x + (eccentricity - 1) * sceneLayout.positionScale;
    const hodograph = hodographCircle(eccentricity);
    const hodographTop = sceneLayout.hodographOffset.y + (hodograph.center.y + hodograph.radius) * sceneLayout.hodographScale;
    const hodographBottom = sceneLayout.hodographOffset.y + (hodograph.center.y - hodograph.radius) * sceneLayout.hodographScale;

    expect(bounds.min.x).toBeLessThanOrEqual(auxiliaryMinimum);
    expect(bounds.max.x).toBeGreaterThanOrEqual(auxiliaryMaximum);
    expect(bounds.min.y).toBeLessThanOrEqual(hodographBottom);
    expect(bounds.max.y).toBeGreaterThanOrEqual(hodographTop);
    expect(bounds.radius).toBeGreaterThan(0);
  });

  it('contains both expanded grids as camera-frame geometry', () => {
    const bounds = computeInstrumentBounds(MAX_ECCENTRICITY, 36);
    expect(bounds.min.x).toBeLessThanOrEqual(sceneLayout.positionOffset.x - 2.35);
    expect(bounds.max.x).toBeGreaterThanOrEqual(sceneLayout.hodographOffset.x + 2.9);
    expect(bounds.min.y).toBeLessThanOrEqual(sceneLayout.hodographOffset.y - 2.9);
  });
});

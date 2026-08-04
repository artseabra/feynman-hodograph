import { describe, expect, it } from 'vitest';
import { hodographWorld } from '../src/model/embedding';
import { equalTimeSamples, MAX_ECCENTRICITY } from '../src/model/orbit';
import {
  auxiliaryCircleOpacity,
  hodographCenterGlyphScale,
  velocitySampleRadius,
  velocityStepGlyphMetrics,
} from '../src/scene/glyphSizing';

describe('construction glyph spacing', () => {
  it.each([0, 0.55, MAX_ECCENTRICITY])(
    'keeps exact equal-time samples distinct at e = %s',
    eccentricity => {
      for (const wedges of [6, 16, 36]) {
        for (const layout of ['merged', 'separated'] as const) {
          const points = equalTimeSamples(eccentricity, wedges).map(sample => (
            hodographWorld(sample.velocity, eccentricity, 0.025, layout)
          ));
          const gaps = points.map((point, index) => {
            const next = points[(index + 1) % points.length];
            return Math.hypot(point.x - next.x, point.y - next.y, point.z - next.z);
          });
          const nearestGap = Math.min(...gaps);
          const markerRadius = velocitySampleRadius(nearestGap);

          expect(markerRadius * 2).toBeLessThan(nearestGap);
          gaps.forEach(gap => {
            const metrics = velocityStepGlyphMetrics(gap);
            expect(metrics.tubeRadius * 2).toBeLessThan(gap);
            expect(metrics.coneRadius * 2).toBeLessThan(gap);
          });
        }
      }
    },
  );

  it('omits a redundant auxiliary stroke only in the circular limit', () => {
    expect(auxiliaryCircleOpacity(0)).toBe(0);
    expect(auxiliaryCircleOpacity(0.02)).toBe(0);
    expect(auxiliaryCircleOpacity(0.06)).toBe(0);
    expect(auxiliaryCircleOpacity(0.55)).toBeGreaterThan(0);
    expect(auxiliaryCircleOpacity(MAX_ECCENTRICITY)).toBeGreaterThanOrEqual(
      auxiliaryCircleOpacity(0.55),
    );
  });

  it('keeps the coincident centre legible without moving it', () => {
    expect(hodographCenterGlyphScale(0)).toBeGreaterThan(1);
    expect(hodographCenterGlyphScale(0.14)).toBe(1);
    expect(hodographCenterGlyphScale(MAX_ECCENTRICITY)).toBe(1);
  });
});

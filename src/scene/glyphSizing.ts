import * as THREE from 'three';

export interface VelocityStepGlyphMetrics {
  tubeRadius: number;
  coneRadius: number;
  coneLength: number;
}

/**
 * Equal-time velocity samples bunch truthfully near perihelion at high e.
 * Shrink only their display glyphs; never move the sampled velocities.
 */
export function velocitySampleRadius(nearestGap: number): number {
  return THREE.MathUtils.clamp(nearestGap * 0.24, 0.008, 0.038);
}

export function velocityStepGlyphMetrics(length: number): VelocityStepGlyphMetrics {
  return {
    tubeRadius: THREE.MathUtils.clamp(length * 0.15, 0.006, 0.018),
    coneRadius: THREE.MathUtils.clamp(length * 0.23, 0.009, 0.045),
    coneLength: THREE.MathUtils.clamp(length * 0.38, 0.016, 0.14),
  };
}

/** The auxiliary circle adds no visible information in the circular limit. */
export function auxiliaryCircleOpacity(eccentricity: number): number {
  if (eccentricity <= 0.06) return 0;
  const separation = THREE.MathUtils.clamp((eccentricity - 0.06) / 0.44, 0, 1);
  return THREE.MathUtils.lerp(0.08, 0.3, separation);
}

/**
 * In the circular limit the Sun, velocity origin, and hodograph centre share
 * the merged projection. Enlarge the hollow annotation instead of displacing
 * any mathematical centre.
 */
export function hodographCenterGlyphScale(eccentricity: number): number {
  const separated = THREE.MathUtils.clamp(eccentricity / 0.14, 0, 1);
  return THREE.MathUtils.lerp(2.35, 1, separated);
}

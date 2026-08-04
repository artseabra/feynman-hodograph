/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import sceneSource from '../src/scene/hodographScene.ts?raw';

const SEMANTIC_TARGETS = [
  'orbital-plane',
  'orbit',
  'reference-circle',
  'equal-time-wedges',
  'sun',
  'planet',
  'radius-vector',
  'velocity-plane',
  'hodograph-circle',
  'hodograph-point',
  'hodograph-center',
  'hodograph-radius',
  'velocity-change-chain',
  'velocity-samples',
  'phase-bridge',
] as const;

describe('canvas tooltip coverage', () => {
  it('registers every visible semantic construction exactly once', () => {
    SEMANTIC_TARGETS.forEach(id => {
      expect(sceneSource.match(new RegExp(`id: '${id}'`, 'g'))).toHaveLength(1);
    });
  });

  it('gives sparse planes and small markers explicit invisible hit geometry', () => {
    expect(sceneSource.match(/planePickProxy/g)?.length).toBeGreaterThanOrEqual(6);
    expect(sceneSource).toContain('markerPickProxy');
    expect(sceneSource).toContain('orbitPickProxy');
    expect(sceneSource).toContain('hodographPickProxy');
  });

  it('renders the auxiliary circle as a restrained dashed line, not an overlapping tube', () => {
    expect(sceneSource).toContain('new THREE.LineLoop');
    expect(sceneSource).toContain('auxiliaryCircleOpacity(eccentricity)');
    expect(sceneSource).not.toMatch(/referenceTube/);
  });

  it('keeps the same-instant bridge visibly above the physical construction', () => {
    expect(sceneSource).toContain('dashSize: 0.17');
    expect(sceneSource).toContain('opacity: 0.88');
    expect(sceneSource).toContain('depthTest: false');
    expect(sceneSource).toContain('this.phaseBridge.renderOrder = 24');
  });
});

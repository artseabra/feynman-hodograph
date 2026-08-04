import { describe, expect, it } from 'vitest';
import { crossedWedgeEvents, orbitalState, TAU } from '../src/model/orbit';
import { markerTuning, orbitalMeasures, sonificationLensProfile } from '../src/audio/sonification';

describe('Keplerian sonification mapping', () => {
  it('derives the conserved angular momentum and hodograph radius from the orbit', () => {
    const state = orbitalState(0.55, TAU * 0.37);
    const measures = orbitalMeasures(state);
    const expectedMomentum = Math.sqrt(1 - 0.55 ** 2);

    expect(measures.angularMomentum).toBeCloseTo(expectedMomentum, 12);
    expect(measures.hodographRadius).toBeCloseTo(1 / expectedMomentum, 12);
    expect(measures.potentialNormalized).toBeGreaterThanOrEqual(0);
    expect(measures.potentialNormalized).toBeLessThanOrEqual(1);
    expect(measures.kineticNormalized).toBeGreaterThanOrEqual(0);
    expect(measures.kineticNormalized).toBeLessThanOrEqual(1);
  });

  it('treats the circular case as a stable middle value rather than a singularity', () => {
    const measures = orbitalMeasures(orbitalState(0, TAU * 0.2));
    expect(measures.angularMomentum).toBe(1);
    expect(measures.hodographRadius).toBe(1);
    expect(measures.potentialNormalized).toBe(0.5);
    expect(measures.kineticNormalized).toBe(0.5);
    expect(measures.gravitationalFieldNormalized).toBe(0.5);
  });

  it('makes the potential and field stronger as the planet approaches the focus', () => {
    const perihelion = orbitalMeasures(orbitalState(0.55, 0));
    const aphelion = orbitalMeasures(orbitalState(0.55, Math.PI));

    expect(perihelion.potential).toBeGreaterThan(aphelion.potential);
    expect(perihelion.gravitationalField).toBeGreaterThan(aphelion.gravitationalField);
    expect(perihelion.gravitationalFieldNormalized).toBeGreaterThan(aphelion.gravitationalFieldNormalized);
  });

  it('uses the exact equal-time crossing to create a bounded resonant mark', () => {
    const [crossing] = crossedWedgeEvents(0, TAU / 16, 16);
    if (!crossing) throw new Error('Expected first wedge crossing');
    const tuning = markerTuning(crossing, orbitalState(0.55, crossing.meanAnomaly));

    expect(tuning.frequency).toBeGreaterThanOrEqual(176);
    expect(tuning.frequency).toBeLessThanOrEqual(1_600);
    expect(tuning.partials).toHaveLength(4);
    expect(tuning.intensity).toBeGreaterThan(0.5);
    expect(Math.abs(tuning.pan)).toBeLessThanOrEqual(0.18);
  });

  it('changes the mix emphasis for each listening lens without changing the orbital source', () => {
    expect(sonificationLensProfile('keplerian')).toMatchObject({ atmosphere: 1, motion: 1, markers: 1 });
    expect(sonificationLensProfile('hodograph').motion).toBeGreaterThan(1);
    expect(sonificationLensProfile('construction').markers).toBeGreaterThan(1);
  });
});

import { describe, expect, it } from 'vitest';
import { crossedWedgeEvents, orbitalState, TAU } from '../src/model/orbit';
import { apsisTuning, gravityFrame, hodographFrame, markerTuning, orbitalMeasures } from '../src/audio/sonification';

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

  it('makes the gravity stem denser and brighter as the planet approaches the focus', () => {
    const perihelionState = orbitalState(0.55, 0);
    const aphelionState = orbitalState(0.55, Math.PI);
    const perihelion = orbitalMeasures(perihelionState);
    const aphelion = orbitalMeasures(aphelionState);

    expect(perihelion.potential).toBeGreaterThan(aphelion.potential);
    expect(perihelion.gravitationalField).toBeGreaterThan(aphelion.gravitationalField);
    expect(perihelion.gravitationalFieldNormalized).toBeGreaterThan(aphelion.gravitationalFieldNormalized);
    expect(gravityFrame(perihelionState).gain).toBeGreaterThan(gravityFrame(aphelionState).gain);
    expect(gravityFrame(perihelionState).brightness).toBeGreaterThan(gravityFrame(aphelionState).brightness);
  });

  it('uses the exact equal-time crossing to create a bounded, centered mark', () => {
    const [crossing] = crossedWedgeEvents(0, TAU / 16, 16);
    if (!crossing) throw new Error('Expected first wedge crossing');
    const tuning = markerTuning(crossing, orbitalState(0.55, crossing.meanAnomaly));

    expect(tuning.frequency).toBeGreaterThanOrEqual(220);
    expect(tuning.frequency).toBeLessThanOrEqual(880);
    expect(tuning.overtone).toBeGreaterThan(1);
    expect(tuning.intensity).toBeGreaterThan(0.5);
    expect(tuning.duration).toBeGreaterThan(0);
  });

  it('maps the hodograph circle into a normalized four-resonator crossfade', () => {
    const north = hodographFrame(orbitalState(0, 0));
    const west = hodographFrame(orbitalState(0, Math.PI / 2));

    expect(north.weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(1, 12);
    expect(west.weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(1, 12);
    expect(north.weights[1]).toBeGreaterThan(0.99);
    expect(west.weights[2]).toBeGreaterThan(0.99);
    expect(north.brightness).toBeGreaterThan(0);
  });

  it('keeps perihelion and aphelion as distinct landmark voices', () => {
    const state = orbitalState(0.55, 0);
    const perihelion = apsisTuning('perihelion', state);
    const aphelion = apsisTuning('aphelion', state);

    expect(perihelion.frequency).toBeGreaterThan(aphelion.frequency);
    expect(perihelion.intensity).toBeGreaterThan(aphelion.intensity);
  });
});

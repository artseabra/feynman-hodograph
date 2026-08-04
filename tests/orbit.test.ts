import { describe, expect, it } from 'vitest';
import {
  MAX_ECCENTRICITY,
  TAU,
  crossedApsisEvents,
  crossedWedgeEvents,
  crossedWedgeIndices,
  equalTimeSamples,
  hodographCircle,
  hodographDistanceFromCircle,
  orbitalState,
  solveKepler,
} from '../src/model/orbit';
import { activeWedgeIndex } from '../src/model/embedding';

describe('Kepler model', () => {
  it('solves Kepler’s equation over the supported eccentricity range', () => {
    [0, 0.31, 0.55, MAX_ECCENTRICITY].forEach(eccentricity => {
      for (let step = 0; step < 32; step += 1) {
        const meanAnomaly = step / 32 * TAU;
        const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
        const residual = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly;
        expect(Math.abs(residual)).toBeLessThan(1e-10);
      }
    });
  });

  it('keeps the circular hodograph centered on the velocity origin', () => {
    const circle = hodographCircle(0);
    expect(circle.center.x).toBe(0);
    expect(circle.center.y).toBe(0);
    expect(circle.radius).toBe(1);
  });

  it('keeps every velocity sample on the analytical hodograph circle', () => {
    [0, 0.55, MAX_ECCENTRICITY].forEach(eccentricity => {
      const expectedRadius = hodographCircle(eccentricity).radius;
      for (let step = 0; step <= 64; step += 1) {
        const state = orbitalState(eccentricity, step / 64 * TAU);
        expect(hodographDistanceFromCircle(state)).toBeCloseTo(expectedRadius, 9);
      }
    });
  });

  it('keeps the hodograph radius perpendicular to the same-phase position vector', () => {
    [0, 0.55, MAX_ECCENTRICITY].forEach(eccentricity => {
      const circle = hodographCircle(eccentricity);
      for (let step = 0; step <= 64; step += 1) {
        const state = orbitalState(eccentricity, step / 64 * TAU);
        const radialX = state.velocity.x - circle.center.x;
        const radialY = state.velocity.y - circle.center.y;
        const dot = radialX * state.position.x + radialY * state.position.y;
        expect(dot).toBeCloseTo(0, 9);
      }
    });
  });

  it('samples equal mean-anomaly steps for equal-time wedges', () => {
    const samples = equalTimeSamples(0.55, 16);
    expect(samples).toHaveLength(16);
    samples.forEach((sample, index) => {
      expect(sample.meanAnomaly).toBeCloseTo(index / 16 * TAU, 12);
    });
  });
});

describe('wedge scheduler', () => {
  it('assigns one shared phase index to the orbital wedge and hodograph step', () => {
    expect(activeWedgeIndex(0, 16)).toBe(0);
    expect(activeWedgeIndex(TAU * 7.8 / 16, 16)).toBe(7);
    expect(activeWedgeIndex(TAU * 15.99 / 16, 16)).toBe(15);
  });

  it('emits one index per crossed equal-time boundary', () => {
    expect(crossedWedgeIndices(0, TAU / 16, 16)).toEqual([1]);
    expect(crossedWedgeIndices(TAU / 16, TAU * 3 / 16, 16)).toEqual([2, 3]);
  });

  it('retains the exact boundary state for sound scheduling', () => {
    expect(crossedWedgeEvents(0, TAU / 16, 16)).toEqual([
      { index: 1, wedgeCount: 16, cycle: 0, meanAnomaly: TAU / 16 },
    ]);
    expect(crossedWedgeEvents(TAU * 15.5 / 16, TAU + 0.04, 16)).toEqual([
      { index: 0, wedgeCount: 16, cycle: 1, meanAnomaly: TAU },
    ]);
  });

  it('wraps cleanly through the final wedge without pause duplicates', () => {
    expect(crossedWedgeIndices(TAU * 15.5 / 16, TAU + 0.04, 16)).toEqual([0]);
    expect(crossedWedgeIndices(TAU + 0.04, TAU + 0.04, 16)).toEqual([]);
    expect(crossedWedgeIndices(TAU + 0.04, TAU + 0.01, 16)).toEqual([]);
  });

  it('emits reversed boundaries in descending time order without constraining the clock', () => {
    expect(crossedWedgeIndices(TAU * 3 / 16, 0, 16)).toEqual([2, 1, 0]);
    expect(crossedWedgeEvents(0.04, -0.04, 16)).toEqual([
      { index: 0, wedgeCount: 16, cycle: 0, meanAnomaly: 0 },
    ]);
    expect(crossedWedgeEvents(-TAU + 0.04, -TAU - 0.04, 16)).toEqual([
      { index: 0, wedgeCount: 16, cycle: -1, meanAnomaly: -TAU },
    ]);
  });

  it('adds the two apsides once per orbital revolution', () => {
    expect(crossedApsisEvents(0, Math.PI)).toEqual([
      { kind: 'aphelion', cycle: 0, meanAnomaly: Math.PI },
    ]);
    expect(crossedApsisEvents(Math.PI, TAU)).toEqual([
      { kind: 'perihelion', cycle: 1, meanAnomaly: TAU },
    ]);
    expect(crossedApsisEvents(TAU, TAU)).toEqual([]);
  });

  it('schedules apsides in reverse when the signed clock runs backward', () => {
    expect(crossedApsisEvents(TAU, 0)).toEqual([
      { kind: 'aphelion', cycle: 0, meanAnomaly: Math.PI },
      { kind: 'perihelion', cycle: 0, meanAnomaly: 0 },
    ]);
    expect(crossedApsisEvents(0.04, -0.04)).toEqual([
      { kind: 'perihelion', cycle: 0, meanAnomaly: 0 },
    ]);
  });
});

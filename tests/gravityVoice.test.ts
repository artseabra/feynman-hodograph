import { describe, expect, it } from 'vitest';
import {
  GRAVITY_DRY_LEVEL,
  GRAVITY_HIGH_PASS_HZ,
  GRAVITY_PERIODIC_PARTIALS,
  GRAVITY_SATURATED_LEVEL,
  GRAVITY_VOICE_BLUEPRINTS,
  gravityPeriodicWaveCoefficients,
  gravitySaturationCurve,
  gravitySaturationSample,
} from '../src/audio/gravityVoice';

describe('Gravity voice definition', () => {
  it('uses the fixed 2:3:4 tuning with consolidated source levels', () => {
    const frequencies = GRAVITY_VOICE_BLUEPRINTS.map(voice => voice.frequency);
    const levels = GRAVITY_VOICE_BLUEPRINTS.map(voice => voice.level);

    expect(frequencies).toEqual([98, 147, 196]);
    expect(frequencies.map(frequency => frequency / 49)).toEqual([2, 3, 4]);
    expect(levels).toEqual([0.3, 0.15, 0.07]);
    expect(levels.reduce((sum, level) => sum + level, 0)).toBeCloseTo(0.52, 12);
  });

  it('keeps the fundamental centered and only the upper voices narrowly opposed', () => {
    expect(GRAVITY_VOICE_BLUEPRINTS.map(voice => voice.pan)).toEqual([0, -0.09, 0.09]);
  });

  it('defines one zero-DC wave whose audible partials strictly decline', () => {
    const coefficients = gravityPeriodicWaveCoefficients();
    const audiblePartials = GRAVITY_PERIODIC_PARTIALS.slice(1);

    expect(GRAVITY_PERIODIC_PARTIALS[0]).toBe(0);
    expect([...coefficients.real]).toEqual(GRAVITY_PERIODIC_PARTIALS.map(() => 0));
    coefficients.imaginary.forEach((partial, index) => {
      expect(partial).toBeCloseTo(GRAVITY_PERIODIC_PARTIALS[index] ?? 0, 7);
    });
    for (let index = 1; index < audiblePartials.length; index += 1) {
      expect(audiblePartials[index]).toBeLessThan(audiblePartials[index - 1] ?? 0);
    }
  });

  it('uses a restrained parallel saturation path after the subsonic cut', () => {
    expect(GRAVITY_HIGH_PASS_HZ).toBe(48);
    expect(GRAVITY_DRY_LEVEL).toBe(0.92);
    expect(GRAVITY_SATURATED_LEVEL).toBe(0.08);
    expect(GRAVITY_DRY_LEVEL + GRAVITY_SATURATED_LEVEL).toBe(1);
  });

  it('builds a deterministic bounded odd soft-saturation curve', () => {
    const first = gravitySaturationCurve(257);
    const second = gravitySaturationCurve(257);

    expect([...first]).toEqual([...second]);
    expect(first[0]).toBeCloseTo(-1, 7);
    expect(first[128]).toBe(0);
    expect(first[256]).toBeCloseTo(1, 7);
    expect(gravitySaturationSample(0.5)).toBeGreaterThan(0.5);
    expect(gravitySaturationSample(-0.5)).toBeCloseTo(-gravitySaturationSample(0.5), 12);
    for (let index = 0; index < first.length; index += 1) {
      expect(first[index]).toBeCloseTo(-(first[first.length - 1 - index] ?? 0), 6);
    }
  });
});

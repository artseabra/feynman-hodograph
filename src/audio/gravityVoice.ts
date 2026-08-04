export interface GravityVoiceBlueprint {
  frequency: number;
  level: number;
  pan: number;
}

/**
 * A fixed 2:3:4 harmonic body. Levels live here once so the source ceiling is
 * explicit: 0.30 + 0.15 + 0.07 = 0.52 before the Gravity mix control.
 */
export const GRAVITY_VOICE_BLUEPRINTS: readonly GravityVoiceBlueprint[] = [
  { frequency: 98, level: 0.3, pan: 0 },
  { frequency: 147, level: 0.15, pan: -0.09 },
  { frequency: 196, level: 0.07, pan: 0.09 },
] as const;

/**
 * Sine-series amplitudes for one shared, deliberately dark PeriodicWave.
 * Index zero is DC and remains silent; each audible partial declines.
 */
export const GRAVITY_PERIODIC_PARTIALS = [0, 1, 0.3, 0.14, 0.07, 0.035] as const;

export const GRAVITY_HIGH_PASS_HZ = 48;
export const GRAVITY_DRY_LEVEL = 0.92;
export const GRAVITY_SATURATED_LEVEL = 0.08;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export interface GravityFieldFrame {
  gain: number;
  brightness: number;
}

/** Map normalized 1/r² to restrained level and brightness floors. */
export function gravityFieldFrame(fieldNormalized: number): GravityFieldFrame {
  const field = clamp(fieldNormalized, 0, 1);
  return {
    gain: Math.min(1, 0.2 + field * 0.8),
    brightness: Math.min(1, 0.18 + field * 0.82),
  };
}

/** A normalized, odd, gently driven soft-clip transfer. */
export function gravitySaturationSample(input: number): number {
  const value = clamp(input, -1, 1);
  const drive = 1.2;
  return Math.tanh(value * drive) / Math.tanh(drive);
}

export function gravitySaturationCurve(sampleCount = 2_049) {
  const length = Math.max(3, Math.floor(sampleCount));
  const curve = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const input = index / (length - 1) * 2 - 1;
    curve[index] = gravitySaturationSample(input);
  }
  return curve;
}

export function gravityPeriodicWaveCoefficients() {
  return {
    real: new Float32Array(GRAVITY_PERIODIC_PARTIALS.length),
    imaginary: Float32Array.from(GRAVITY_PERIODIC_PARTIALS),
  };
}

import { type ApsisCrossing, type WedgeCrossing } from '../model/orbit';
import type { AudioMix, OrbitalState } from '../types';
import {
  GRAVITY_DRY_LEVEL,
  GRAVITY_HIGH_PASS_HZ,
  GRAVITY_SATURATED_LEVEL,
  GRAVITY_VOICE_BLUEPRINTS,
  gravityPeriodicWaveCoefficients,
  gravitySaturationCurve,
  type GravityVoiceBlueprint,
} from './gravityVoice';
import { apsisTuning, boundaryPulse, gravityFrame, hodographFrame } from './sonification';

interface ContinuousVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  baseLevel: number;
}

interface VoiceBlueprint {
  frequency: number;
  level: number;
  type: OscillatorType;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function setTarget(parameter: AudioParam, value: number, time: number, timeConstant = 0.08): void {
  parameter.setTargetAtTime(value, time, timeConstant);
}

function deterministicNoise(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return ((value >>> 0) / 0xffff_ffff) * 2 - 1;
  };
}

function impulseResponse(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 0.58);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  const random = deterministicNoise(0x5e1ec7);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const decay = Math.pow(1 - index / length, 2.45);
      data[index] = random() * decay * 0.42;
    }
  }
  return buffer;
}

function transientNoise(context: AudioContext, durationSeconds: number, seed = Math.round(durationSeconds * 1_000_003)): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const random = deterministicNoise(seed);
  for (let index = 0; index < length; index += 1) {
    data[index] = random() * Math.pow(1 - index / length, 3.1);
  }
  return buffer;
}

/**
 * A browser-native score for the normalized two-body solution.
 *
 * The graph has deliberately separate voices: normalized 1/r² raises and
 * opens the gravity bed; the hodograph rotates through stationary resonators;
 * exact construction boundaries make dry inharmonic pulses while the two
 * apsides remain tonal landmarks. No stem is driven by render-frame frequency
 * or treated as an engine imitation.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private gravity: GainNode | null = null;
  private hodograph: GainNode | null = null;
  private markers: GainNode | null = null;
  private gravityFilter: BiquadFilterNode | null = null;
  private hodographFilter: BiquadFilterNode | null = null;
  private gravityVoices: ContinuousVoice[] = [];
  private hodographVoices: ContinuousVoice[] = [];
  private enabled = false;
  private muted = false;
  private mix: AudioMix | null = null;
  private nextMarkerTime = 0;

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  async enable(mix: AudioMix): Promise<boolean> {
    if (!this.context) this.createGraph();
    if (!this.context || !this.master) return false;

    try {
      if (this.context.state !== 'running') await this.context.resume();
      this.enabled = true;
      this.muted = false;
      this.setMix(mix);
      return true;
    } catch {
      return false;
    }
  }

  setMix(mix: AudioMix): void {
    this.mix = mix;
    this.muted = mix.muted;
    if (!this.context || !this.master || !this.gravity || !this.hodograph || !this.markers) return;
    const time = this.context.currentTime;
    setTarget(this.master.gain, mix.muted ? 0 : clamp(mix.master, 0, 1) * 0.86, time, 0.06);
    setTarget(this.gravity.gain, mix.muted ? 0 : clamp(mix.gravity, 0, 1), time, 0.07);
    setTarget(this.hodograph.gain, mix.muted ? 0 : clamp(mix.velocity, 0, 1), time, 0.07);
    setTarget(this.markers.gain, mix.muted ? 0 : clamp(mix.markers, 0, 1), time, 0.035);
  }

  update(state: OrbitalState, playing: boolean): void {
    if (
      !this.enabled
      || !this.context
      || !this.mix
      || !this.gravityFilter
      || !this.hodographFilter
    ) return;

    const time = this.context.currentTime;
    const activity = playing && !this.muted ? 1 : 0;
    const gravity = gravityFrame(state);
    const hodograph = hodographFrame(state);

    this.gravityVoices.forEach(voice => {
      setTarget(voice.gain.gain, activity * voice.baseLevel * gravity.gain, time, 0.16);
    });
    setTarget(this.gravityFilter.frequency, 420 + gravity.brightness * 2_500, time, 0.18);
    setTarget(this.gravityFilter.Q, 0.48 + gravity.brightness * 0.34, time, 0.18);

    this.hodographVoices.forEach((voice, index) => {
      const weight = hodograph.weights[index] ?? 0;
      setTarget(voice.gain.gain, activity * voice.baseLevel * weight * hodograph.gain, time, 0.12);
    });
    setTarget(this.hodographFilter.frequency, 760 + hodograph.brightness * 2_340, time, 0.14);
    setTarget(this.hodographFilter.Q, 0.46 + hodograph.brightness * 0.38, time, 0.14);
  }

  triggerWedge(crossing: WedgeCrossing, state: OrbitalState): void {
    if (!this.enabled || this.muted || !this.context || !this.mix) return;
    const pulse = boundaryPulse(crossing, state);
    this.boundaryStrike(
      this.reserveMarkerTime(),
      pulse.frequency,
      pulse.modeRatio,
      pulse.intensity * 0.22,
      pulse.duration,
    );
  }

  triggerApsis(kind: ApsisCrossing['kind'], state: OrbitalState): void {
    if (!this.enabled || this.muted || !this.context || !this.mix) return;
    const tuning = apsisTuning(kind, state);
    this.strike(this.reserveMarkerTime(0.09), tuning.frequency, tuning.overtone, tuning.intensity * 0.29, tuning.duration);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.mix) this.setMix({ ...this.mix, muted: this.muted });
    return this.muted;
  }

  async destroy(): Promise<void> {
    [...this.gravityVoices, ...this.hodographVoices].forEach(voice => {
      try {
        voice.oscillator.stop();
      } catch {
        // A stopped oscillator is already safe to discard.
      }
    });
    this.gravityVoices = [];
    this.hodographVoices = [];
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
    this.enabled = false;
  }

  private reserveMarkerTime(spacing = 0.055): number {
    if (!this.context) return 0;
    const time = Math.max(this.context.currentTime + 0.008, this.nextMarkerTime);
    this.nextMarkerTime = time + spacing;
    return time;
  }

  private boundaryStrike(
    time: number,
    frequency: number,
    modeRatio: number,
    amplitude: number,
    duration: number,
  ): void {
    if (!this.context || !this.markers) return;
    const context = this.context;
    const fundamental = context.createOscillator();
    const mode = context.createOscillator();
    const fundamentalGain = context.createGain();
    const modeGain = context.createGain();

    fundamental.type = 'sine';
    mode.type = 'sine';
    fundamental.frequency.setValueAtTime(frequency, time);
    fundamental.frequency.exponentialRampToValueAtTime(frequency * 0.955, time + duration);
    mode.frequency.setValueAtTime(frequency * modeRatio, time);
    mode.frequency.exponentialRampToValueAtTime(frequency * modeRatio * 0.925, time + duration * 0.82);

    fundamentalGain.gain.setValueAtTime(0.0001, time);
    fundamentalGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), time + 0.004);
    fundamentalGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    modeGain.gain.setValueAtTime(0.0001, time);
    modeGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude * 0.3), time + 0.0025);
    modeGain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 0.72);

    fundamental.connect(fundamentalGain);
    mode.connect(modeGain);
    fundamentalGain.connect(this.markers);
    modeGain.connect(this.markers);
    fundamental.start(time);
    mode.start(time);
    fundamental.stop(time + duration + 0.025);
    mode.stop(time + duration + 0.025);
  }

  private strike(
    time: number,
    frequency: number,
    overtoneRatio: number,
    amplitude: number,
    duration: number,
  ): void {
    if (!this.context || !this.markers) return;
    const context = this.context;
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const fundamental = context.createOscillator();
    const overtone = context.createOscillator();
    const overtoneGain = context.createGain();
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.min(4_800, frequency * 2.6), time);
    filter.Q.setValueAtTime(0.58, time);
    fundamental.type = 'triangle';
    fundamental.frequency.setValueAtTime(frequency, time);
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(frequency * overtoneRatio, time);
    overtoneGain.gain.setValueAtTime(0.28, time);
    noise.buffer = transientNoise(context, 0.032, Math.round(frequency * 1_009));
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(Math.min(6_200, frequency * 3.2), time);

    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), time + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    noiseGain.gain.setValueAtTime(Math.max(0.0001, amplitude * 0.19), time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.028);

    fundamental.connect(envelope);
    overtone.connect(overtoneGain);
    overtoneGain.connect(envelope);
    envelope.connect(filter);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(filter);
    filter.connect(this.markers);
    fundamental.start(time);
    overtone.start(time);
    noise.start(time);
    fundamental.stop(time + duration + 0.04);
    overtone.stop(time + duration + 0.04);
    noise.stop(time + 0.04);
  }

  private createGraph(): void {
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const gravity = context.createGain();
    const gravityHighPass = context.createBiquadFilter();
    const gravityDry = context.createGain();
    const gravitySaturator = context.createWaveShaper();
    const gravitySaturated = context.createGain();
    const gravityFilter = context.createBiquadFilter();
    const hodograph = context.createGain();
    const hodographFilter = context.createBiquadFilter();
    const markers = context.createGain();
    const markerReverb = context.createConvolver();
    const markerReverbWet = context.createGain();

    compressor.threshold.setValueAtTime(-18, context.currentTime);
    compressor.knee.setValueAtTime(18, context.currentTime);
    compressor.ratio.setValueAtTime(8, context.currentTime);
    compressor.attack.setValueAtTime(0.004, context.currentTime);
    compressor.release.setValueAtTime(0.2, context.currentTime);
    master.gain.setValueAtTime(0, context.currentTime);
    gravityHighPass.type = 'highpass';
    gravityHighPass.frequency.setValueAtTime(GRAVITY_HIGH_PASS_HZ, context.currentTime);
    gravityHighPass.Q.setValueAtTime(0.707, context.currentTime);
    gravityDry.gain.setValueAtTime(GRAVITY_DRY_LEVEL, context.currentTime);
    gravitySaturator.curve = gravitySaturationCurve();
    gravitySaturator.oversample = '2x';
    gravitySaturated.gain.setValueAtTime(GRAVITY_SATURATED_LEVEL, context.currentTime);
    gravityFilter.type = 'lowpass';
    gravityFilter.frequency.setValueAtTime(1_100, context.currentTime);
    gravityFilter.Q.setValueAtTime(0.62, context.currentTime);
    hodographFilter.type = 'lowpass';
    hodographFilter.frequency.setValueAtTime(1_650, context.currentTime);
    hodographFilter.Q.setValueAtTime(0.64, context.currentTime);
    markerReverb.buffer = impulseResponse(context);
    markerReverbWet.gain.setValueAtTime(0.075, context.currentTime);

    gravity.connect(gravityHighPass);
    gravityHighPass.connect(gravityDry);
    gravityHighPass.connect(gravitySaturator);
    gravityDry.connect(gravityFilter);
    gravitySaturator.connect(gravitySaturated);
    gravitySaturated.connect(gravityFilter);
    gravityFilter.connect(compressor);
    hodograph.connect(hodographFilter);
    hodographFilter.connect(compressor);
    markers.connect(compressor);
    markers.connect(markerReverb);
    markerReverb.connect(markerReverbWet);
    markerReverbWet.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);

    this.context = context;
    this.master = master;
    this.gravity = gravity;
    this.hodograph = hodograph;
    this.markers = markers;
    this.gravityFilter = gravityFilter;
    this.hodographFilter = hodographFilter;
    const gravityCoefficients = gravityPeriodicWaveCoefficients();
    const gravityWave = context.createPeriodicWave(
      gravityCoefficients.real,
      gravityCoefficients.imaginary,
      { disableNormalization: false },
    );
    this.gravityVoices = this.makeGravityVoices(context, gravity, gravityWave, GRAVITY_VOICE_BLUEPRINTS);
    this.hodographVoices = this.makeContinuousVoices(context, hodograph, [
      { frequency: 220, level: 0.25, type: 'triangle' },
      { frequency: 277.1826, level: 0.22, type: 'sine' },
      { frequency: 329.6276, level: 0.2, type: 'triangle' },
      { frequency: 415.3047, level: 0.18, type: 'sine' },
    ]);
  }

  private makeContinuousVoices(
    context: AudioContext,
    destination: AudioNode,
    blueprints: readonly VoiceBlueprint[],
  ): ContinuousVoice[] {
    return blueprints.map(blueprint => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = blueprint.type;
      oscillator.frequency.setValueAtTime(blueprint.frequency, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      return { oscillator, gain, baseLevel: blueprint.level };
    });
  }

  private makeGravityVoices(
    context: AudioContext,
    destination: AudioNode,
    periodicWave: PeriodicWave,
    blueprints: readonly GravityVoiceBlueprint[],
  ): ContinuousVoice[] {
    return blueprints.map(blueprint => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      oscillator.setPeriodicWave(periodicWave);
      oscillator.frequency.value = blueprint.frequency;
      panner.pan.value = blueprint.pan;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      oscillator.connect(gain);
      gain.connect(panner);
      panner.connect(destination);
      oscillator.start();
      return { oscillator, gain, baseLevel: blueprint.level };
    });
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

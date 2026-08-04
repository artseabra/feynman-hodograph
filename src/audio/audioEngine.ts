import { type ApsisCrossing, type WedgeCrossing } from '../model/orbit';
import type { AudioMix, OrbitalState } from '../types';
import { markerTuning, orbitalMeasures, sonificationLensProfile } from './sonification';

interface ContinuousVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  ratio: number;
  baseLevel: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function setTarget(parameter: AudioParam, value: number, time: number, timeConstant = 0.08): void {
  parameter.setTargetAtTime(value, time, timeConstant);
}

/**
 * Browser-native, additive sonification of the normalized Kepler solution.
 * It does not use samples or make a claim about what a planet "sounds like".
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private atmosphere: GainNode | null = null;
  private motion: GainNode | null = null;
  private markers: GainNode | null = null;
  private atmosphereFilter: BiquadFilterNode | null = null;
  private motionFilter: BiquadFilterNode | null = null;
  private atmosphereVoices: ContinuousVoice[] = [];
  private motionVoices: ContinuousVoice[] = [];
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
    if (!this.context || !this.master || !this.markers) return;
    const time = this.context.currentTime;
    setTarget(this.master.gain, mix.muted ? 0 : mix.master * 0.72, time, 0.075);
    // Marker level is a dedicated bus control, not a timid multiplier buried
    // beneath the continuous score. At 100% the equal-time construction must
    // read as a clear foreground landmark even on laptop speakers.
    setTarget(this.markers.gain, mix.muted ? 0 : mix.markers, time, 0.055);
  }

  update(state: OrbitalState, playing: boolean): void {
    if (
      !this.enabled
      || !this.context
      || !this.mix
      || !this.atmosphere
      || !this.motion
      || !this.atmosphereFilter
      || !this.motionFilter
    ) return;

    const time = this.context.currentTime;
    const measures = orbitalMeasures(state);
    const profile = sonificationLensProfile(this.mix.lens);
    const activity = playing && !this.muted ? 1 : 0;
    const potentialShape = measures.potentialNormalized - 0.5;
    const phaseBrightness = 0.5 + 0.5 * Math.cos(measures.hodographAngle);

    // The field is a just-intoned stack whose slow colour follows potential.
    // Pitch only moves by a few cents, preserving a stable instrument rather
    // than turning the orbit into a queasy continuous siren.
    const atmosphereBase = 58 * Math.pow(2, (measures.hodographRadius - 1) * 0.18 + potentialShape * 0.025);
    this.atmosphereVoices.forEach(voice => {
      setTarget(voice.oscillator.frequency, atmosphereBase * voice.ratio, time, 0.18);
      setTarget(
        voice.gain.gain,
        voice.baseLevel * (0.58 + measures.gravitationalFieldNormalized * 0.56),
        time,
        0.2,
      );
    });
    setTarget(this.atmosphereFilter.frequency, 330 + measures.gravitationalFieldNormalized * 1_840, time, 0.22);
    setTarget(
      this.atmosphere.gain,
      this.mix.atmosphere * profile.atmosphere * activity * (0.2 + measures.gravitationalFieldNormalized * 0.62),
      time,
      0.18,
    );

    // Velocity enters as brightness and a constrained pitch interval. Phase
    // changes spectral weight only; it never flings the listener left/right.
    const motionBase = 148;
    this.motionVoices.forEach((voice, index) => {
      setTarget(voice.oscillator.frequency, motionBase * voice.ratio, time, 0.11);
      const phaseWeight = index === 0 ? 0.82 + phaseBrightness * 0.16 : 0.42 + (1 - phaseBrightness) * 0.24;
      setTarget(voice.gain.gain, voice.baseLevel * phaseWeight, time, 0.12);
    });
    setTarget(this.motionFilter.frequency, 620 + measures.kineticNormalized * 2_180 + phaseBrightness * 260, time, 0.13);
    setTarget(
      this.motion.gain,
      this.mix.motion * profile.motion * activity * (0.22 + measures.kineticNormalized * 0.46),
      time,
      0.1,
    );
  }

  triggerWedge(crossing: WedgeCrossing, state: OrbitalState): void {
    if (!this.enabled || this.muted || !this.context || !this.mix) return;
    const profile = sonificationLensProfile(this.mix.lens);
    const tuning = markerTuning(crossing, state);
    const time = this.reserveMarkerTime();
    this.strike(
      time,
      tuning.frequency * profile.markerPitch,
      tuning.partials,
      0.3 * profile.markers * tuning.intensity,
      tuning.duration,
      tuning.pan,
    );
  }

  triggerApsis(kind: ApsisCrossing['kind'], state: OrbitalState): void {
    if (!this.enabled || this.muted || !this.context || !this.mix) return;
    const measures = orbitalMeasures(state);
    const profile = sonificationLensProfile(this.mix.lens);
    const time = this.reserveMarkerTime(0.085);
    const aphelion = kind === 'aphelion';
    const frequency = clamp(
      (aphelion ? 164 : 264) * Math.pow(2, (measures.hodographRadius - 1) * 0.16) * profile.markerPitch,
      118,
      1_060,
    );
    this.strike(
      time,
      frequency,
      aphelion ? [1, 0.24, 0.08] : [1, 0.48, 0.22, 0.08],
      0.31 * profile.markers * (aphelion ? 0.74 : 1),
      aphelion ? 1.35 : 0.92,
      0,
    );
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.mix) this.setMix({ ...this.mix, muted: this.muted });
    return this.muted;
  }

  async destroy(): Promise<void> {
    [...this.atmosphereVoices, ...this.motionVoices].forEach(voice => {
      try {
        voice.oscillator.stop();
      } catch {
        // A stopped oscillator is already safe to discard.
      }
    });
    this.atmosphereVoices = [];
    this.motionVoices = [];
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

  private strike(
    time: number,
    frequency: number,
    partials: readonly number[],
    amplitude: number,
    duration: number,
    pan: number,
  ): void {
    if (!this.context || !this.markers) return;
    const filter = this.context.createBiquadFilter();
    const panner = this.context.createStereoPanner();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.min(7_000, frequency * 1.82), time);
    filter.Q.setValueAtTime(1.35, time);
    panner.pan.setValueAtTime(clamp(pan, -0.22, 0.22), time);

    partials.forEach((partial, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const partialDuration = duration * (1 - Math.min(index, 3) * 0.11);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency * (index === 0 ? 1 : index === 1 ? 1.5 : index === 2 ? 2.01 : 2.73), time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude * partial), time + 0.014 + index * 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + partialDuration);
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start(time);
      oscillator.stop(time + partialDuration + 0.035);
    });

    filter.connect(panner);
    panner.connect(this.markers);
  }

  private createGraph(): void {
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const atmosphere = context.createGain();
    const atmosphereFilter = context.createBiquadFilter();
    const motion = context.createGain();
    const motionFilter = context.createBiquadFilter();
    const markers = context.createGain();
    const markerDelay = context.createDelay(0.55);
    const markerFeedback = context.createGain();
    const markerEchoFilter = context.createBiquadFilter();
    const markerWet = context.createGain();

    compressor.threshold.setValueAtTime(-13, context.currentTime);
    compressor.knee.setValueAtTime(12, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0.006, context.currentTime);
    compressor.release.setValueAtTime(0.24, context.currentTime);
    master.gain.setValueAtTime(0, context.currentTime);

    atmosphereFilter.type = 'lowpass';
    atmosphereFilter.Q.setValueAtTime(0.72, context.currentTime);
    motionFilter.type = 'lowpass';
    motionFilter.Q.setValueAtTime(1.8, context.currentTime);
    markerDelay.delayTime.setValueAtTime(0.233, context.currentTime);
    markerFeedback.gain.setValueAtTime(0.17, context.currentTime);
    markerEchoFilter.type = 'lowpass';
    markerEchoFilter.frequency.setValueAtTime(2_300, context.currentTime);
    markerWet.gain.setValueAtTime(0.14, context.currentTime);

    atmosphere.connect(atmosphereFilter);
    atmosphereFilter.connect(compressor);
    motion.connect(motionFilter);
    motionFilter.connect(compressor);
    markers.connect(compressor);
    markers.connect(markerDelay);
    markerDelay.connect(markerFeedback);
    markerFeedback.connect(markerDelay);
    markerDelay.connect(markerEchoFilter);
    markerEchoFilter.connect(markerWet);
    markerWet.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);

    const atmosphereVoices = this.makeContinuousVoices(context, atmosphere, [1, 1.25, 1.5, 2], [0.5, 0.22, 0.15, 0.09]);
    const motionVoices = this.makeContinuousVoices(context, motion, [1, 1.5], [0.24, 0.1]);

    this.context = context;
    this.master = master;
    this.atmosphere = atmosphere;
    this.motion = motion;
    this.markers = markers;
    this.atmosphereFilter = atmosphereFilter;
    this.motionFilter = motionFilter;
    this.atmosphereVoices = atmosphereVoices;
    this.motionVoices = motionVoices;
  }

  private makeContinuousVoices(
    context: AudioContext,
    destination: AudioNode,
    ratios: readonly number[],
    levels: readonly number[],
  ): ContinuousVoice[] {
    return ratios.map((ratio, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(80 * ratio, context.currentTime);
      gain.gain.setValueAtTime(levels[index] ?? 0.1, context.currentTime);
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      return { oscillator, gain, ratio, baseLevel: levels[index] ?? 0.1 };
    });
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

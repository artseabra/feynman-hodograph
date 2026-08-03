import type { AudioMix, OrbitalState } from '../types';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function setTarget(parameter: AudioParam, value: number, time: number, timeConstant = 0.08): void {
  parameter.cancelScheduledValues(time);
  parameter.setTargetAtTime(value, time, timeConstant);
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private atmosphere: GainNode | null = null;
  private motion: GainNode | null = null;
  private markers: GainNode | null = null;
  private atmosphereFilter: BiquadFilterNode | null = null;
  private motionFilter: BiquadFilterNode | null = null;
  private motionPan: StereoPannerNode | null = null;
  private atmosphereVoices: OscillatorNode[] = [];
  private motionVoice: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private enabled = false;
  private muted = false;
  private mix: AudioMix | null = null;

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
    if (!this.context || !this.master || !this.atmosphere || !this.motion || !this.markers) return;
    const time = this.context.currentTime;
    const attenuation = mix.muted ? 0 : 1;
    setTarget(this.master.gain, attenuation * mix.master * 0.72, time, 0.1);
    setTarget(this.atmosphere.gain, mix.atmosphere, time);
    setTarget(this.motion.gain, mix.motion, time);
    setTarget(this.markers.gain, mix.markers, time);
  }

  update(state: OrbitalState, playing: boolean): void {
    if (!this.enabled || !this.context || !this.mix || !this.atmosphereFilter || !this.motionFilter || !this.motionPan || !this.motionVoice) return;
    const time = this.context.currentTime;
    const radiusFloor = 1 - state.eccentricity;
    const radiusCeiling = 1 + state.eccentricity;
    const radiusNormal = (state.radius - radiusFloor) / Math.max(0.001, radiusCeiling - radiusFloor);
    const speedFloor = Math.sqrt((1 - state.eccentricity) / (1 + state.eccentricity));
    const speedCeiling = Math.sqrt((1 + state.eccentricity) / (1 - state.eccentricity));
    const speedNormal = clamp((state.speed - speedFloor) / Math.max(0.001, speedCeiling - speedFloor), 0, 1);
    const activity = playing && !this.muted ? 1 : 0;

    this.atmosphereVoices.forEach((voice, index) => {
      const harmonic = [1, 1.498, 2.006][index] ?? 1;
      setTarget(voice.frequency, (43 + radiusNormal * 14) * harmonic, time, 0.22);
    });
    setTarget(this.atmosphereFilter.frequency, 480 + radiusNormal * 1380, time, 0.26);
    setTarget(this.motionVoice.frequency, 104 + speedNormal * 216 + Math.sin(state.trueAnomaly) * 8, time, 0.1);
    setTarget(this.motionFilter.frequency, 760 + speedNormal * 2750, time, 0.12);
    setTarget(this.motionPan.pan, clamp(Math.sin(state.trueAnomaly) * 0.72, -0.86, 0.86), time, 0.12);
    setTarget(this.atmosphere!.gain, this.mix.atmosphere * activity * 0.72, time, 0.18);
    setTarget(this.motion!.gain, this.mix.motion * activity * (0.18 + speedNormal * 0.42), time, 0.1);
  }

  triggerWedge(wedgeIndex: number, state: OrbitalState): void {
    if (!this.enabled || this.muted || !this.context || !this.markers || !this.mix) return;
    const time = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    const overtone = wedgeIndex % 5;
    const frequency = 190 + overtone * 39 + clamp(state.speed, 0, 3.5) * 27;

    oscillator.type = wedgeIndex % 2 === 0 ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, time);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency * 2.1, time);
    filter.Q.setValueAtTime(4.8, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.11 * this.mix.markers, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.48);
    pan.pan.setValueAtTime(Math.sin(state.trueAnomaly) * 0.58, time);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.markers);
    oscillator.start(time);
    oscillator.stop(time + 0.52);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.mix) this.setMix({ ...this.mix, muted: this.muted });
    return this.muted;
  }

  async destroy(): Promise<void> {
    this.atmosphereVoices.forEach(voice => voice.stop());
    this.motionVoice?.stop();
    this.lfo?.stop();
    this.atmosphereVoices = [];
    this.motionVoice = null;
    this.lfo = null;
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
    this.enabled = false;
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
    const motionPan = context.createStereoPanner();
    const markers = context.createGain();
    const delay = context.createDelay(1.4);
    const feedback = context.createGain();
    const wet = context.createGain();

    compressor.threshold.setValueAtTime(-19, context.currentTime);
    compressor.knee.setValueAtTime(20, context.currentTime);
    compressor.ratio.setValueAtTime(10, context.currentTime);
    compressor.attack.setValueAtTime(0.008, context.currentTime);
    compressor.release.setValueAtTime(0.18, context.currentTime);
    master.gain.setValueAtTime(0, context.currentTime);
    atmosphereFilter.type = 'lowpass';
    atmosphereFilter.Q.setValueAtTime(0.8, context.currentTime);
    motionFilter.type = 'lowpass';
    motionFilter.Q.setValueAtTime(2.6, context.currentTime);
    delay.delayTime.setValueAtTime(0.37, context.currentTime);
    feedback.gain.setValueAtTime(0.31, context.currentTime);
    wet.gain.setValueAtTime(0.16, context.currentTime);

    atmosphere.connect(atmosphereFilter);
    atmosphereFilter.connect(compressor);
    atmosphereFilter.connect(delay);
    motion.connect(motionFilter);
    motionFilter.connect(motionPan);
    motionPan.connect(compressor);
    motionPan.connect(delay);
    markers.connect(compressor);
    markers.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.setValueAtTime(0.075, context.currentTime);
    lfoGain.gain.setValueAtTime(11, context.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(atmosphereFilter.frequency);
    lfo.start();

    const atmosphereVoices = [1, 1.498, 2.006].map((ratio, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(46 * ratio, context.currentTime);
      gain.gain.setValueAtTime(index === 0 ? 0.45 : 0.18, context.currentTime);
      oscillator.connect(gain);
      gain.connect(atmosphere);
      oscillator.start();
      return oscillator;
    });

    const motionVoice = context.createOscillator();
    const motionGain = context.createGain();
    motionVoice.type = 'sine';
    motionVoice.frequency.setValueAtTime(128, context.currentTime);
    motionGain.gain.setValueAtTime(0.55, context.currentTime);
    motionVoice.connect(motionGain);
    motionGain.connect(motion);
    motionVoice.start();

    this.context = context;
    this.master = master;
    this.atmosphere = atmosphere;
    this.motion = motion;
    this.markers = markers;
    this.atmosphereFilter = atmosphereFilter;
    this.motionFilter = motionFilter;
    this.motionPan = motionPan;
    this.atmosphereVoices = atmosphereVoices;
    this.motionVoice = motionVoice;
    this.lfo = lfo;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

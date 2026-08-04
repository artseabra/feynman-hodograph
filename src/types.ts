export type ThemeName = 'light' | 'chalkboard';

export type CameraView = 'proof' | 'front' | 'overhead' | 'side';
export type CameraFocus = 'free' | 'sun' | 'planet' | 'hodograph';

export interface Point2 {
  x: number;
  y: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface OrbitalState {
  eccentricity: number;
  meanAnomaly: number;
  eccentricAnomaly: number;
  trueAnomaly: number;
  position: Point2;
  velocity: Point2;
  radius: number;
  speed: number;
}

export interface EqualTimeSample extends OrbitalState {
  index: number;
}

export interface SceneBounds {
  min: Point3;
  max: Point3;
  center: Point3;
  size: Point3;
  radius: number;
}

export interface AudioMix {
  enabled: boolean;
  muted: boolean;
  master: number;
  gravity: number;
  velocity: number;
  markers: number;
}

export interface InstrumentState {
  eccentricity: number;
  wedges: number;
  speed: number;
  meanAnomaly: number;
  playing: boolean;
  theme: ThemeName;
  activeDock: 'playback' | 'geometry' | 'camera' | 'sound' | null;
  cameraFocus: CameraFocus;
  audio: AudioMix;
}

export interface ThemePalette {
  background: string;
  backgroundFar: string;
  ink: string;
  muted: string;
  rule: string;
  orbit: string;
  sun: string;
  hodograph: string;
  vector: string;
  construction: string;
  wedge: string;
  grid: string;
}

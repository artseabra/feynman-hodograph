import './styles/main.css';
import { AudioEngine } from './audio/audioEngine';
import { crossedApsisEvents, crossedWedgeEvents, hodographCircle, orbitalState, TAU } from './model/orbit';
import { FallbackRenderer } from './scene/fallback';
import { HodographScene } from './scene/hodographScene';
import type { AudioMix, CameraFocus, CameraView, InstrumentState, SonificationLens, ThemeName, ThemePalette } from './types';

const palettes: Record<ThemeName, ThemePalette> = {
  light: {
    background: '#faf7ef',
    backgroundFar: '#f0eadc',
    ink: '#191c21',
    muted: '#5d626b',
    rule: '#b8b5ae',
    orbit: '#c65d2c',
    sun: '#d99a3a',
    hodograph: '#315a9a',
    vector: '#147d6d',
    construction: '#7893c3',
    wedge: '#e99a62',
    grid: '#9ba3ac',
  },
  chalkboard: {
    background: '#101815',
    backgroundFar: '#18221c',
    ink: '#efe8d7',
    muted: '#b8b2a5',
    rule: '#657067',
    orbit: '#e18850',
    sun: '#e8bd63',
    hodograph: '#84a9dc',
    vector: '#76baa5',
    construction: '#aab9ce',
    wedge: '#c88a67',
    grid: '#69746c',
  },
};

const dockNames = ['playback', 'geometry', 'camera', 'sound'] as const;
type DockName = (typeof dockNames)[number];

function getElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required interface element: ${selector}`);
  return element;
}

function getThemePreference(): ThemeName {
  try {
    return localStorage.getItem('feynman-hodograph.theme') === 'chalkboard' ? 'chalkboard' : 'light';
  } catch {
    return 'light';
  }
}

function safeStoreTheme(theme: ThemeName): void {
  try {
    localStorage.setItem('feynman-hodograph.theme', theme);
  } catch {
    // Private browsing and locked-down contexts can still use the instrument.
  }
}

function formatNumber(value: number): string {
  return value.toFixed(3);
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function dockName(value: string | undefined): DockName | null {
  return dockNames.find(candidate => candidate === value) ?? null;
}

const stage = getElement<HTMLElement>('#stage');
const stageShell = getElement<HTMLElement>('#stage-shell');
const stageGuide = getElement<HTMLElement>('#stage-guide');
const stageGuideDismiss = getElement<HTMLButtonElement>('#stage-guide-dismiss');
const radiusReadout = getElement<HTMLElement>('#radius-readout');
const speedReadout = getElement<HTMLElement>('#speed-readout');
const offsetReadout = getElement<HTMLElement>('#offset-readout');
const phaseReadout = getElement<HTMLElement>('#phase-readout');
const renderStatus = getElement<HTMLElement>('#render-status');
const playToggle = getElement<HTMLButtonElement>('#play-toggle');
const restart = getElement<HTMLButtonElement>('#restart');
const speedControl = getElement<HTMLInputElement>('#speed-control');
const speedValue = getElement<HTMLOutputElement>('#time-scale-value');
const eccentricityControl = getElement<HTMLInputElement>('#eccentricity-control');
const eccentricityValue = getElement<HTMLOutputElement>('#eccentricity-value');
const wedgesControl = getElement<HTMLInputElement>('#wedges-control');
const wedgesValue = getElement<HTMLOutputElement>('#wedges-value');
const themeToggle = getElement<HTMLButtonElement>('#theme-toggle');
const cameraReset = getElement<HTMLButtonElement>('#camera-reset');
const soundEnable = getElement<HTMLButtonElement>('#sound-enable');
const soundStateLabel = getElement<HTMLElement>('#sound-state-label');
const soundStateIcon = getElement<HTMLElement>('.sound-state-icon');
const soundLens = getElement<HTMLSelectElement>('#sound-lens');

const audioControls = {
  master: getElement<HTMLInputElement>('#sound-master'),
  atmosphere: getElement<HTMLInputElement>('#sound-atmosphere'),
  markers: getElement<HTMLInputElement>('#sound-markers'),
};

const audioValues = {
  master: getElement<HTMLOutputElement>('#sound-master-value'),
  atmosphere: getElement<HTMLOutputElement>('#sound-atmosphere-value'),
  markers: getElement<HTMLOutputElement>('#sound-markers-value'),
};

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const state: InstrumentState = {
  eccentricity: Number(eccentricityControl.value),
  wedges: Number(wedgesControl.value),
  speed: Number(speedControl.value),
  meanAnomaly: 0,
  playing: !prefersReducedMotion,
  theme: getThemePreference(),
  activeDock: null,
  cameraFocus: 'free',
  audio: {
    enabled: false,
    muted: false,
    lens: soundLens.value as SonificationLens,
    master: Number(audioControls.master.value),
    atmosphere: Number(audioControls.atmosphere.value),
    markers: Number(audioControls.markers.value),
  },
};

let scene: HodographScene | null = null;
let fallback: FallbackRenderer | null = null;
try {
  scene = new HodographScene(stage, { eccentricity: state.eccentricity, wedges: state.wedges }, palettes[state.theme]);
} catch {
  fallback = new FallbackRenderer(stage, state.eccentricity, state.wedges, palettes[state.theme]);
  renderStatus.hidden = false;
  renderStatus.textContent = 'WebGL is unavailable here. The live 2D construction remains available.';
}

const audio = new AudioEngine();
let lastTimestamp = performance.now();

function currentMix(): AudioMix {
  return { ...state.audio };
}

function updateControlReadouts(): void {
  eccentricityValue.value = state.eccentricity.toFixed(2);
  wedgesValue.value = String(state.wedges);
  speedValue.value = `${state.speed.toFixed(1)}×`;
  Object.entries(audioValues).forEach(([key, output]) => {
    const mixKey = key as keyof Pick<AudioMix, 'master' | 'atmosphere' | 'markers'>;
    output.value = percentage(state.audio[mixKey]);
  });
  playToggle.textContent = state.playing ? 'Pause' : 'Play';
  playToggle.setAttribute('aria-pressed', String(state.playing));
}

function updateReadouts(): void {
  const orbital = orbitalState(state.eccentricity, state.meanAnomaly);
  const circle = hodographCircle(state.eccentricity);
  phaseReadout.textContent = `${(orbital.meanAnomaly / TAU * 360).toFixed(1)}°`;
  radiusReadout.textContent = formatNumber(orbital.radius);
  speedReadout.textContent = formatNumber(orbital.speed);
  offsetReadout.textContent = formatNumber(circle.center.y);
}

function updateSurface(): void {
  scene?.setParameters({ eccentricity: state.eccentricity, wedges: state.wedges });
  fallback?.setParameters(state.eccentricity, state.wedges);
  updateControlReadouts();
  updateReadouts();
}

function applyTheme(theme: ThemeName): void {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  getElement<HTMLMetaElement>('meta[name="theme-color"]').content = theme === 'chalkboard' ? '#101815' : '#faf7ef';
  themeToggle.setAttribute('aria-label', theme === 'light' ? 'Switch to chalkboard theme' : 'Switch to warm paper theme');
  themeToggle.querySelector('span')!.textContent = theme === 'light' ? '◐' : '◑';
  scene?.setPalette(palettes[theme]);
  fallback?.setPalette(palettes[theme]);
  safeStoreTheme(theme);
}

function mountElevenLabsAudioNative(): void {
  const publicUserId = document
    .querySelector<HTMLMetaElement>('meta[name="elevenlabs-public-user-id"]')
    ?.content.trim();
  const projectId = document
    .querySelector<HTMLMetaElement>('meta[name="elevenlabs-audio-native-project-id"]')
    ?.content.trim();
  if (!publicUserId || !projectId) return;

  const slot = getElement<HTMLElement>('#elevenlabs-audionative-slot');
  const player = document.createElement('div');
  player.id = 'elevenlabs-audionative-widget';
  player.dataset.height = '90';
  player.dataset.width = '100%';
  player.dataset.frameborder = 'no';
  player.dataset.scrolling = 'no';
  player.dataset.publicuserid = publicUserId;
  player.dataset.playerurl = 'https://elevenlabs.io/player/index.html';
  player.dataset.projectid = projectId;
  const loadingLink = document.createElement('a');
  loadingLink.href = 'https://elevenlabs.io/text-to-speech';
  loadingLink.target = '_blank';
  loadingLink.rel = 'noreferrer';
  loadingLink.textContent = 'ElevenLabs Audio Native';
  player.append('Loading the ', loadingLink, ' player…');
  slot.replaceChildren(player);
  slot.classList.add('is-mounted');

  const helper = document.createElement('script');
  helper.src = 'https://elevenlabs.io/player/audioNativeHelper.js';
  helper.type = 'text/javascript';
  helper.async = true;
  document.head.append(helper);
}

function activateDock(nextDock: DockName | null): void {
  state.activeDock = state.activeDock === nextDock ? null : nextDock;
  document.querySelectorAll<HTMLButtonElement>('[data-dock]').forEach(button => {
    const active = button.dataset.dock === state.activeDock;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-expanded', String(active));
  });
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => {
    const active = panel.dataset.panel === state.activeDock;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
}

function updateSoundButton(): void {
  const label = !state.audio.enabled ? 'Enable' : state.audio.muted ? 'Muted' : 'Sound on';
  soundStateLabel.textContent = label;
  soundStateIcon.textContent = state.audio.enabled && !state.audio.muted ? '◉' : '◌';
  soundEnable.classList.toggle('is-active', state.audio.enabled && !state.audio.muted);
  soundEnable.setAttribute('aria-pressed', String(state.audio.enabled && !state.audio.muted));
  soundEnable.setAttribute('aria-label', !state.audio.enabled ? 'Enable sound' : state.audio.muted ? 'Unmute sound' : 'Mute sound');
}

function resizeScene(): void {
  const bounds = stage.getBoundingClientRect();
  scene?.resize(bounds.width, bounds.height);
  fallback?.resize(bounds.width, bounds.height);
}

function dismissStageGuide(): void {
  // Remove rather than relying on the browser's `hidden` stylesheet: this
  // guide is a transient input layer and must never remain above the canvas
  // after the user has explicitly dismissed it.
  stageGuide.remove();
}

function syncAudio(): void {
  Object.entries(audioControls).forEach(([key, input]) => {
    const mixKey = key as keyof Pick<AudioMix, 'master' | 'atmosphere' | 'markers'>;
    state.audio[mixKey] = Number(input.value);
  });
  audio.setMix(currentMix());
  updateControlReadouts();
}

function setCameraFocus(focus: CameraFocus): void {
  state.cameraFocus = focus;
  scene?.setCameraFocus(focus);
  document.querySelectorAll<HTMLButtonElement>('[data-camera-focus]').forEach(button => {
    const active = button.dataset.cameraFocus === focus;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-dock]').forEach(button => {
  button.addEventListener('click', () => {
    const next = dockName(button.dataset.dock);
    if (next) activateDock(next);
  });
});

stageGuideDismiss.addEventListener('pointerdown', dismissStageGuide);
stageGuideDismiss.addEventListener('click', dismissStageGuide);
stage.addEventListener('hodograph:interact', dismissStageGuide, { once: true });

document.querySelectorAll<HTMLButtonElement>('[data-camera-view]').forEach(button => {
  button.addEventListener('click', () => {
    setCameraFocus('free');
    scene?.setView(button.dataset.cameraView as CameraView);
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-camera-focus]').forEach(button => {
  button.addEventListener('click', () => {
    setCameraFocus(button.dataset.cameraFocus as CameraFocus);
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-tooltip-target]').forEach(button => {
  button.addEventListener('click', () => {
    const targetId = button.dataset.tooltipTarget;
    if (!targetId) return;
    const tooltip = document.getElementById(targetId);
    if (!tooltip) return;
    const open = tooltip.hidden;
    tooltip.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  });
});

playToggle.addEventListener('click', () => {
  state.playing = !state.playing;
  updateControlReadouts();
});

restart.addEventListener('click', () => {
  state.meanAnomaly = 0;
  updateReadouts();
});

speedControl.addEventListener('input', () => {
  state.speed = Number(speedControl.value);
  updateControlReadouts();
});

eccentricityControl.addEventListener('input', () => {
  state.eccentricity = Number(eccentricityControl.value);
  updateSurface();
});

wedgesControl.addEventListener('input', () => {
  state.wedges = Number(wedgesControl.value);
  updateSurface();
});

themeToggle.addEventListener('click', () => applyTheme(state.theme === 'light' ? 'chalkboard' : 'light'));
cameraReset.addEventListener('click', () => {
  setCameraFocus('free');
  scene?.frameAll();
});

soundEnable.addEventListener('click', async () => {
  if (!audio.isEnabled) {
    const enabled = await audio.enable(currentMix());
    state.audio.enabled = enabled;
    state.audio.muted = false;
  } else {
    state.audio.muted = audio.toggleMute();
  }
  updateSoundButton();
});

Object.values(audioControls).forEach(input => input.addEventListener('input', syncAudio));
soundLens.addEventListener('change', () => {
  state.audio.lens = soundLens.value as SonificationLens;
  audio.setMix(currentMix());
});

const resizeObserver = new ResizeObserver(resizeScene);
resizeObserver.observe(stageShell);

function animate(timestamp: number): void {
  const deltaSeconds = Math.min(0.12, Math.max(0, (timestamp - lastTimestamp) / 1000));
  lastTimestamp = timestamp;
  const previousMeanAnomaly = state.meanAnomaly;
  if (state.playing) state.meanAnomaly += deltaSeconds * state.speed * 0.58;

  const orbital = orbitalState(state.eccentricity, state.meanAnomaly);
  if (state.playing && audio.isEnabled) {
    crossedWedgeEvents(previousMeanAnomaly, state.meanAnomaly, state.wedges)
      .forEach(event => audio.triggerWedge(event, orbitalState(state.eccentricity, event.meanAnomaly)));
    crossedApsisEvents(previousMeanAnomaly, state.meanAnomaly)
      .forEach(event => audio.triggerApsis(event.kind, orbitalState(state.eccentricity, event.meanAnomaly)));
  }
  audio.update(orbital, state.playing);
  scene?.update(orbital, timestamp);
  fallback?.render(orbital);
  updateReadouts();
  window.requestAnimationFrame(animate);
}

applyTheme(state.theme);
mountElevenLabsAudioNative();
updateSoundButton();
updateSurface();
resizeScene();
window.requestAnimationFrame(animate);

window.addEventListener('pagehide', () => {
  resizeObserver.disconnect();
  scene?.destroy();
  void audio.destroy();
}, { once: true });

import './styles/main.css';
import { AudioEngine } from './audio/audioEngine';
import { crossedWedgeIndices, hodographCircle, orbitalState } from './model/orbit';
import { FallbackRenderer } from './scene/fallback';
import { HodographScene } from './scene/hodographScene';
import type { AudioMix, CameraView, InstrumentState, ThemeName, ThemePalette } from './types';

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

const dockNames = ['playback', 'geometry', 'camera', 'theme', 'sound'] as const;
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
const radiusReadout = getElement<HTMLElement>('#radius-readout');
const speedReadout = getElement<HTMLElement>('#speed-readout');
const offsetReadout = getElement<HTMLElement>('#offset-readout');
const renderStatus = getElement<HTMLElement>('#render-status');
const playToggle = getElement<HTMLButtonElement>('#play-toggle');
const restart = getElement<HTMLButtonElement>('#restart');
const speedControl = getElement<HTMLInputElement>('#speed-control');
const speedValue = getElement<HTMLOutputElement>('#time-scale-value');
const eccentricityControl = getElement<HTMLInputElement>('#eccentricity-control');
const eccentricityValue = getElement<HTMLOutputElement>('#eccentricity-value');
const wedgesControl = getElement<HTMLInputElement>('#wedges-control');
const wedgesValue = getElement<HTMLOutputElement>('#wedges-value');
const proofToggle = getElement<HTMLButtonElement>('#proof-toggle');
const proof = getElement<HTMLElement>('#proof');
const themeToggle = getElement<HTMLButtonElement>('#theme-toggle');
const lightThemeButton = getElement<HTMLButtonElement>('#theme-light');
const chalkboardThemeButton = getElement<HTMLButtonElement>('#theme-chalkboard');
const cameraReset = getElement<HTMLButtonElement>('#camera-reset');
const soundEnable = getElement<HTMLButtonElement>('#sound-enable');
const soundMute = getElement<HTMLButtonElement>('#sound-mute');

const audioControls = {
  master: getElement<HTMLInputElement>('#sound-master'),
  atmosphere: getElement<HTMLInputElement>('#sound-atmosphere'),
  motion: getElement<HTMLInputElement>('#sound-motion'),
  markers: getElement<HTMLInputElement>('#sound-markers'),
};

const audioValues = {
  master: getElement<HTMLOutputElement>('#sound-master-value'),
  atmosphere: getElement<HTMLOutputElement>('#sound-atmosphere-value'),
  motion: getElement<HTMLOutputElement>('#sound-motion-value'),
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
  proofOpen: false,
  activeDock: 'playback',
  audio: {
    enabled: false,
    muted: false,
    master: Number(audioControls.master.value),
    atmosphere: Number(audioControls.atmosphere.value),
    motion: Number(audioControls.motion.value),
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
    const mixKey = key as keyof Pick<AudioMix, 'master' | 'atmosphere' | 'motion' | 'markers'>;
    output.value = percentage(state.audio[mixKey]);
  });
  playToggle.textContent = state.playing ? 'Pause' : 'Play';
  playToggle.setAttribute('aria-pressed', String(state.playing));
}

function updateReadouts(): void {
  const orbital = orbitalState(state.eccentricity, state.meanAnomaly);
  const circle = hodographCircle(state.eccentricity);
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
  lightThemeButton.classList.toggle('is-selected', theme === 'light');
  lightThemeButton.setAttribute('aria-pressed', String(theme === 'light'));
  chalkboardThemeButton.classList.toggle('is-selected', theme === 'chalkboard');
  chalkboardThemeButton.setAttribute('aria-pressed', String(theme === 'chalkboard'));
  themeToggle.setAttribute('aria-label', theme === 'light' ? 'Switch to chalkboard theme' : 'Switch to warm paper theme');
  themeToggle.querySelector('span')!.textContent = theme === 'light' ? '◐' : '◑';
  scene?.setPalette(palettes[theme]);
  fallback?.setPalette(palettes[theme]);
  safeStoreTheme(theme);
}

function activateDock(nextDock: DockName): void {
  state.activeDock = nextDock;
  document.querySelectorAll<HTMLButtonElement>('[data-dock]').forEach(button => {
    const active = button.dataset.dock === nextDock;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => {
    const active = panel.dataset.panel === nextDock;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
}

function setProofOpen(open: boolean): void {
  state.proofOpen = open;
  proof.hidden = !open;
  proofToggle.setAttribute('aria-expanded', String(open));
  proofToggle.textContent = open ? 'Hide construction' : 'Construction';
  if (open) requestAnimationFrame(() => proof.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function resizeScene(): void {
  const bounds = stage.getBoundingClientRect();
  scene?.resize(bounds.width, bounds.height);
  fallback?.resize(bounds.width, bounds.height);
}

function syncAudio(): void {
  Object.entries(audioControls).forEach(([key, input]) => {
    const mixKey = key as keyof Pick<AudioMix, 'master' | 'atmosphere' | 'motion' | 'markers'>;
    state.audio[mixKey] = Number(input.value);
  });
  audio.setMix(currentMix());
  updateControlReadouts();
}

document.querySelectorAll<HTMLButtonElement>('[data-dock]').forEach(button => {
  button.addEventListener('click', () => {
    const next = dockName(button.dataset.dock);
    if (next) activateDock(next);
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-camera-view]').forEach(button => {
  button.addEventListener('click', () => {
    scene?.setView(button.dataset.cameraView as CameraView);
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

proofToggle.addEventListener('click', () => setProofOpen(!state.proofOpen));
themeToggle.addEventListener('click', () => applyTheme(state.theme === 'light' ? 'chalkboard' : 'light'));
lightThemeButton.addEventListener('click', () => applyTheme('light'));
chalkboardThemeButton.addEventListener('click', () => applyTheme('chalkboard'));
cameraReset.addEventListener('click', () => scene?.resetCamera());

soundEnable.addEventListener('click', async () => {
  const enabled = await audio.enable(currentMix());
  state.audio.enabled = enabled;
  state.audio.muted = false;
  soundEnable.textContent = enabled ? 'Sound enabled' : 'Audio unavailable';
  soundEnable.disabled = enabled;
  soundMute.disabled = !enabled;
  soundMute.textContent = 'Mute';
});

soundMute.addEventListener('click', () => {
  state.audio.muted = audio.toggleMute();
  soundMute.textContent = state.audio.muted ? 'Unmute' : 'Mute';
});

Object.values(audioControls).forEach(input => input.addEventListener('input', syncAudio));

const resizeObserver = new ResizeObserver(resizeScene);
resizeObserver.observe(stageShell);

function animate(timestamp: number): void {
  const deltaSeconds = Math.min(0.12, Math.max(0, (timestamp - lastTimestamp) / 1000));
  lastTimestamp = timestamp;
  const previousMeanAnomaly = state.meanAnomaly;
  if (state.playing) state.meanAnomaly += deltaSeconds * state.speed * 0.58;

  const orbital = orbitalState(state.eccentricity, state.meanAnomaly);
  if (state.playing && audio.isEnabled) {
    crossedWedgeIndices(previousMeanAnomaly, state.meanAnomaly, state.wedges)
      .forEach(index => audio.triggerWedge(index, orbital));
  }
  audio.update(orbital, state.playing);
  scene?.update(orbital, timestamp);
  fallback?.render(orbital);
  updateReadouts();
  window.requestAnimationFrame(animate);
}

applyTheme(state.theme);
updateSurface();
resizeScene();
window.requestAnimationFrame(animate);

window.addEventListener('pagehide', () => {
  resizeObserver.disconnect();
  scene?.destroy();
  void audio.destroy();
}, { once: true });

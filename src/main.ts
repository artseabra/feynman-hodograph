import './styles/main.css';
import './styles/mobile.css';
import { AudioEngine } from './audio/audioEngine';
import { crossedApsisEvents, crossedWedgeEvents, hodographCircle, orbitalState, TAU } from './model/orbit';
import { FallbackRenderer } from './scene/fallback';
import { HodographScene } from './scene/hodographScene';
import { OutroHodographScene } from './scene/outroHodographScene';
import type { AudioMix, CameraFocus, CameraView, ConstructionLayout, InstrumentState, ThemeName, ThemePalette } from './types';
import { initialCameraState, reduceCameraState } from './ui/cameraState';
import { InterfaceTooltipController } from './ui/interfaceTooltips';

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
const EXPLORE_GUIDE_STORAGE_KEY = 'feynman-hodograph.explore-guide-seen.v2';
type DockName = (typeof dockNames)[number];

async function syncLocalSourceAvailability(): Promise<void> {
  const localSourceElements = document.querySelectorAll<HTMLElement>('[data-local-source]');
  if (localSourceElements.length === 0) return;

  try {
    const response = await fetch('/sources/Goodstein.pdf', {
      method: 'HEAD',
      cache: 'no-store',
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && contentType.includes('application/pdf')) {
      document.documentElement.dataset.localSources = 'available';
      return;
    }
  } catch {
    // The public build intentionally omits rights-held source reproductions.
  }

  document.documentElement.dataset.localSources = 'unavailable';
  localSourceElements.forEach(element => {
    element.hidden = true;
  });
}

void syncLocalSourceAvailability();

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

function hasSeenExploreGuide(): boolean {
  try {
    return localStorage.getItem(EXPLORE_GUIDE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeExploreGuideSeen(): void {
  try {
    localStorage.setItem(EXPLORE_GUIDE_STORAGE_KEY, 'true');
  } catch {
    // The guide still dismisses for this visit when storage is unavailable.
  }
}

function formatNumber(value: number): string {
  return value.toFixed(3);
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatTimeScale(value: number): string {
  if (Math.abs(value) < 1e-9) return '0×';
  return (value < 0 ? '−' : '') + Math.abs(value).toFixed(1) + '×';
}

function formatClock(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function dockName(value: string | undefined): DockName | null {
  return dockNames.find(candidate => candidate === value) ?? null;
}

const stage = getElement<HTMLElement>('#stage');
const stageShell = getElement<HTMLElement>('#stage-shell');
const stageGuide = getElement<HTMLElement>('#stage-guide');
const stageGuideDismiss = getElement<HTMLButtonElement>('#stage-guide-dismiss');
const stageInstructions = getElement<HTMLElement>('#stage-instructions');
const stageControlsToggle = getElement<HTMLButtonElement>('#stage-controls-toggle');
const stageControlsOverlay = getElement<HTMLElement>('#stage-controls-overlay');
const stageControlsClose = getElement<HTMLButtonElement>('#stage-controls-close');
const cameraFramingHud = getElement<HTMLElement>('#camera-framing-hud');
const cameraFramingControl = getElement<HTMLInputElement>('#camera-framing-control');
const cameraFramingState = getElement<HTMLOutputElement>('#camera-framing-state');
const cameraFramingDecrease = getElement<HTMLButtonElement>('#camera-framing-decrease');
const cameraFramingIncrease = getElement<HTMLButtonElement>('#camera-framing-increase');
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
const navNarration = getElement<HTMLButtonElement>('#nav-narration');
const navNarrationIcon = getElement<HTMLElement>('#nav-narration-icon');
const navNarrationLabel = getElement<HTMLElement>('#nav-narration-label');
const constructionLayoutToggle = getElement<HTMLButtonElement>('#construction-layout-toggle');
const constructionLayoutLabel = getElement<HTMLElement>('#construction-layout-label');
const soundEnable = getElement<HTMLButtonElement>('#sound-enable');
const soundStateLabel = getElement<HTMLElement>('#sound-state-label');
const soundStateIcon = getElement<HTMLElement>('.sound-state-icon');
const narrationAudio = getElement<HTMLAudioElement>('#narration-audio');
const narrationPlay = getElement<HTMLButtonElement>('#narration-play');
const narrationPlayIcon = getElement<HTMLElement>('.narration-play-icon');
const narrationPlayLabel = getElement<HTMLElement>('#narration-play-label');
const narrationSeek = getElement<HTMLInputElement>('#narration-seek');
const narrationTime = getElement<HTMLOutputElement>('#narration-time');
const narrationVolume = getElement<HTMLInputElement>('#narration-volume');
const narrationVolumeValue = getElement<HTMLOutputElement>('#narration-volume-value');
const storySection = getElement<HTMLElement>('#story');
const outroStage = getElement<HTMLElement>('#outro-stage');
const interfaceTooltips = new InterfaceTooltipController();

if (hasSeenExploreGuide()) {
  stageGuide.remove();
  stageShell.dataset.guideVisible = 'false';
} else {
  stageShell.dataset.guideVisible = 'true';
}

const audioControls = {
  master: getElement<HTMLInputElement>('#sound-master'),
  gravity: getElement<HTMLInputElement>('#sound-gravity'),
  velocity: getElement<HTMLInputElement>('#sound-velocity'),
  markers: getElement<HTMLInputElement>('#sound-markers'),
};

const audioValues = {
  master: getElement<HTMLOutputElement>('#sound-master-value'),
  gravity: getElement<HTMLOutputElement>('#sound-gravity-value'),
  velocity: getElement<HTMLOutputElement>('#sound-velocity-value'),
  markers: getElement<HTMLOutputElement>('#sound-markers-value'),
};

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const initialCamera = initialCameraState();
const state: InstrumentState = {
  eccentricity: Number(eccentricityControl.value),
  wedges: Number(wedgesControl.value),
  speed: Number(speedControl.value),
  meanAnomaly: 0,
  playing: !prefersReducedMotion,
  theme: getThemePreference(),
  activeDock: null,
  ...initialCamera,
  constructionLayout: 'separated',
  audio: {
    enabled: false,
    muted: false,
    master: Number(audioControls.master.value),
    gravity: Number(audioControls.gravity.value),
    velocity: Number(audioControls.velocity.value),
    markers: Number(audioControls.markers.value),
  },
};

let scene: HodographScene | null = null;
let fallback: FallbackRenderer | null = null;
let outroScene: OutroHodographScene | null = null;
let exploring = false;
let mainSceneVisible = true;
let outroSceneVisible = false;
let cameraFramingHudTimer: number | undefined;
try {
  scene = new HodographScene(stage, { eccentricity: state.eccentricity, wedges: state.wedges }, palettes[state.theme]);
} catch {
  fallback = new FallbackRenderer(stage, state.eccentricity, state.wedges, palettes[state.theme]);
  renderStatus.hidden = false;
  renderStatus.textContent = 'WebGL is unavailable here. The live 2D construction remains available.';
}
try {
  outroScene = new OutroHodographScene(outroStage, palettes[state.theme]);
} catch {
  outroStage.dataset.renderStatus = 'unavailable';
}

const audio = new AudioEngine();
let lastTimestamp = performance.now();

function currentMix(): AudioMix {
  return { ...state.audio };
}

function updateControlReadouts(): void {
  eccentricityValue.value = state.eccentricity.toFixed(2);
  wedgesValue.value = String(state.wedges);
  speedValue.value = formatTimeScale(state.speed);
  Object.entries(audioValues).forEach(([key, output]) => {
    const mixKey = key as keyof Pick<AudioMix, 'master' | 'gravity' | 'velocity' | 'markers'>;
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
  outroScene?.setPalette(palettes[theme]);
  safeStoreTheme(theme);
}

function syncNarrationPlayer(): void {
  const duration = narrationAudio.duration;
  const hasDuration = Number.isFinite(duration) && duration > 0;
  narrationSeek.disabled = !hasDuration;
  if (hasDuration) {
    narrationSeek.max = String(duration);
    narrationSeek.value = String(Math.min(narrationAudio.currentTime, duration));
  }
  narrationTime.value = `${formatClock(narrationAudio.currentTime)} / ${formatClock(duration)}`;
  const playing = !narrationAudio.paused && !narrationAudio.ended;
  narrationPlayIcon.textContent = playing ? 'Ⅱ' : '▶';
  narrationPlayLabel.textContent = playing ? 'Pause' : 'Play';
  narrationPlay.setAttribute('aria-pressed', String(playing));
  navNarrationIcon.textContent = playing ? 'Ⅱ' : '▶';
  navNarrationLabel.textContent = playing ? 'Pause narration' : 'Play narration';
  navNarration.setAttribute('aria-label', playing ? 'Pause narration' : 'Play narration');
  navNarration.setAttribute('aria-pressed', String(playing));
  navNarration.classList.toggle('is-active', playing);
}

function syncNarrationVolume(): void {
  narrationAudio.volume = Number(narrationVolume.value);
  narrationVolumeValue.value = percentage(narrationAudio.volume);
}

async function toggleNarration(scrollOnPlay = false): Promise<void> {
  const starting = narrationAudio.paused || narrationAudio.ended;
  if (starting) {
    if (narrationAudio.ended) narrationAudio.currentTime = 0;
    try {
      await narrationAudio.play();
      if (scrollOnPlay) {
        storySection.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    } catch {
      // The controls remain available if a browser temporarily blocks media.
    }
  } else {
    narrationAudio.pause();
  }
  syncNarrationPlayer();
}

function setupNarrationPlayer(): void {
  narrationPlay.addEventListener('click', () => void toggleNarration());
  navNarration.addEventListener('click', () => {
    interfaceTooltips.hideNow();
    void toggleNarration(true);
  });
  narrationSeek.addEventListener('input', () => {
    narrationAudio.currentTime = Number(narrationSeek.value);
    syncNarrationPlayer();
  });
  narrationVolume.addEventListener('input', syncNarrationVolume);
  ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended'].forEach(eventName => {
    narrationAudio.addEventListener(eventName, syncNarrationPlayer);
  });
  narrationAudio.addEventListener('error', () => {
    narrationPlay.disabled = true;
    navNarration.disabled = true;
    narrationPlayLabel.textContent = 'Unavailable';
    navNarrationLabel.textContent = 'Narration unavailable';
  });
  syncNarrationVolume();
  syncNarrationPlayer();
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
  const label = !state.audio.enabled ? 'Enable sound' : state.audio.muted ? 'Unmute sound' : 'Mute sound';
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
  const outroBounds = outroStage.getBoundingClientRect();
  outroScene?.resize(outroBounds.width, outroBounds.height);
}

function setExploring(nextExploring: boolean): void {
  exploring = nextExploring;
  stageShell.dataset.exploring = String(exploring);
  stageInstructions.textContent = exploring
    ? 'Drag to orbit · scroll to reframe · click outside for page scroll'
    : 'Select the construction to explore';
  scene?.setExploring(exploring);
}

function syncCameraFraming(value = scene?.getCameraFraming() ?? Number(cameraFramingControl.value) / 100): void {
  const framing = Math.max(0, Math.min(1, value));
  const position = Math.round(framing * 100);
  cameraFramingControl.value = String(position);
  cameraFramingState.value = String(position);
  cameraFramingHud.style.setProperty('--camera-framing-position', `${position}%`);
}

function scheduleCameraFramingHudClose(): void {
  if (cameraFramingHudTimer !== undefined) window.clearTimeout(cameraFramingHudTimer);
  cameraFramingHudTimer = window.setTimeout(() => {
    cameraFramingHud.hidden = true;
    cameraFramingHudTimer = undefined;
  }, 2200);
}

function showCameraFramingHud(): void {
  cameraFramingHud.hidden = false;
  scheduleCameraFramingHudClose();
}

function stepCameraFraming(delta: number): void {
  const framing = scene?.adjustCameraFraming(delta)
    ?? Math.max(0, Math.min(1, Number(cameraFramingControl.value) / 100 + delta));
  syncCameraFraming(framing);
  showCameraFramingHud();
}

function setStageControlsOpen(open: boolean): void {
  stageControlsOverlay.hidden = !open;
  stageControlsToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    interfaceTooltips.hideNow();
    stageControlsClose.focus();
  } else {
    stageControlsToggle.focus();
  }
}

function dismissStageGuide(): void {
  // Remove rather than relying on the browser's `hidden` stylesheet: this
  // guide is a transient input layer and must never remain above the canvas
  // after the user has explicitly dismissed it.
  if (!stageGuide.isConnected) return;
  stageShell.dataset.guideVisible = 'false';
  storeExploreGuideSeen();
  stageGuide.remove();
}

function syncAudio(): void {
  Object.entries(audioControls).forEach(([key, input]) => {
    const mixKey = key as keyof Pick<AudioMix, 'master' | 'gravity' | 'velocity' | 'markers'>;
    state.audio[mixKey] = Number(input.value);
  });
  audio.setMix(currentMix());
  updateControlReadouts();
}

function syncCameraControls(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-camera-view]').forEach(button => {
    const active = button.dataset.cameraView === state.cameraView;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-camera-focus]').forEach(button => {
    const active = button.dataset.cameraFocus === state.cameraFocus;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function syncConstructionLayoutControl(): void {
  const separated = state.constructionLayout === 'separated';
  constructionLayoutToggle.dataset.constructionLayout = state.constructionLayout;
  constructionLayoutToggle.setAttribute('aria-pressed', String(separated));
  constructionLayoutToggle.setAttribute(
    'aria-label',
    separated
      ? 'Merge position and velocity spaces at the shared origin'
      : 'Show separated position and velocity spaces',
  );
  constructionLayoutLabel.textContent = separated ? 'Separated construction' : 'Merged construction';
}

function togglePlayback(): void {
  if (state.playing) {
    state.playing = false;
  } else {
    if (Math.abs(state.speed) < 1e-9) {
      state.speed = 1;
      speedControl.value = '1';
    }
    state.playing = true;
  }
  updateControlReadouts();
}

function selectConstructionLayout(layout: ConstructionLayout): void {
  if (state.constructionLayout === layout) return;
  state.constructionLayout = layout;
  scene?.setLayout(layout);
  syncCameraFraming();
  syncConstructionLayoutControl();
}

function selectCameraView(view: CameraView): void {
  const next = reduceCameraState(state, { type: 'preset', view });
  state.cameraView = next.cameraView;
  state.cameraFocus = next.cameraFocus;
  scene?.setView(view);
  syncCameraFraming();
  syncCameraControls();
  activateDock(null);
}

function setCameraFocus(focus: CameraFocus): void {
  // An active travel mode already owns the current bearing. Re-entering it
  // would either discard an authored fixed view (Free) or jump a body-relative
  // camera back to its initial bearing, so repeated selection is a true no-op.
  if (state.cameraFocus === focus) return;
  const next = reduceCameraState(state, { type: 'focus', focus });
  state.cameraView = next.cameraView;
  state.cameraFocus = next.cameraFocus;
  scene?.setCameraFocus(focus);
  syncCameraControls();
}

function markCameraCustom(): void {
  const next = reduceCameraState(state, { type: 'manual' });
  if (next.cameraView === state.cameraView) return;
  state.cameraView = next.cameraView;
  state.cameraFocus = next.cameraFocus;
  syncCameraControls();
}

document.querySelectorAll<HTMLButtonElement>('[data-dock]').forEach(button => {
  button.addEventListener('click', () => {
    const next = dockName(button.dataset.dock);
    if (next) activateDock(next);
  });
});

stageGuideDismiss.addEventListener('click', () => {
  setExploring(true);
  dismissStageGuide();
});
stage.addEventListener('pointerdown', () => {
  setExploring(true);
  scene?.canvas.focus({ preventScroll: true });
});
stage.addEventListener('hodograph:interact', () => {
  setExploring(true);
  dismissStageGuide();
}, { once: true });
stage.addEventListener('hodograph:interact', event => {
  if (!(event instanceof CustomEvent)) return;
  if (typeof event.detail?.cameraFraming === 'number') syncCameraFraming(event.detail.cameraFraming);
  if (event.detail?.cameraView === 'custom') markCameraCustom();
});
document.addEventListener('pointerdown', event => {
  if (event.target instanceof Node && !stageShell.contains(event.target)) setExploring(false);
});

stageControlsToggle.addEventListener('click', () => setStageControlsOpen(true));
stageControlsClose.addEventListener('click', () => setStageControlsOpen(false));
stageControlsOverlay.addEventListener('pointerdown', event => {
  if (event.target === stageControlsOverlay) setStageControlsOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !stageControlsOverlay.hidden) setStageControlsOpen(false);
});

stage.addEventListener('keydown', event => {
  if (!(event.target instanceof HTMLCanvasElement)) return;
  let handled = true;
  switch (event.key) {
    case 'ArrowLeft': scene?.nudgeCamera(event.shiftKey ? 'pan-left' : 'orbit-left'); break;
    case 'ArrowRight': scene?.nudgeCamera(event.shiftKey ? 'pan-right' : 'orbit-right'); break;
    case 'ArrowUp': scene?.nudgeCamera(event.shiftKey ? 'pan-up' : 'orbit-up'); break;
    case 'ArrowDown': scene?.nudgeCamera(event.shiftKey ? 'pan-down' : 'orbit-down'); break;
    case '[': {
      stepCameraFraming(-0.045);
      break;
    }
    case ']': {
      stepCameraFraming(0.045);
      break;
    }
    case '0': selectCameraView('spatial'); break;
    default:
      if (event.code === 'Space') togglePlayback();
      else handled = false;
  }
  if (!handled) return;
  event.preventDefault();
  setExploring(true);
  dismissStageGuide();
});

cameraFramingControl.addEventListener('input', () => {
  const framing = scene?.setCameraFraming(Number(cameraFramingControl.value) / 100)
    ?? Number(cameraFramingControl.value) / 100;
  syncCameraFraming(framing);
  showCameraFramingHud();
});
cameraFramingControl.addEventListener('focus', showCameraFramingHud);
cameraFramingDecrease.addEventListener('click', () => stepCameraFraming(-0.045));
cameraFramingIncrease.addEventListener('click', () => stepCameraFraming(0.045));
cameraFramingHud.addEventListener('pointerenter', () => {
  if (cameraFramingHudTimer !== undefined) window.clearTimeout(cameraFramingHudTimer);
});
cameraFramingHud.addEventListener('pointerleave', scheduleCameraFramingHudClose);

document.querySelectorAll<HTMLButtonElement>('[data-camera-view]').forEach(button => {
  button.addEventListener('click', () => {
    selectCameraView(button.dataset.cameraView as CameraView);
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-camera-focus]').forEach(button => {
  button.addEventListener('click', () => {
    setCameraFocus(button.dataset.cameraFocus as CameraFocus);
    activateDock(null);
  });
});

constructionLayoutToggle.addEventListener('click', () => {
  interfaceTooltips.hideNow();
  selectConstructionLayout(state.constructionLayout === 'merged' ? 'separated' : 'merged');
});

playToggle.addEventListener('click', togglePlayback);

restart.addEventListener('click', () => {
  state.meanAnomaly = 0;
  updateReadouts();
});

speedControl.addEventListener('input', () => {
  state.speed = Number(speedControl.value);
  state.playing = Math.abs(state.speed) > 1e-9;
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

const resizeObserver = new ResizeObserver(resizeScene);
resizeObserver.observe(stageShell);
resizeObserver.observe(outroStage);

const sceneVisibilityObserver = typeof IntersectionObserver === 'undefined'
  ? null
  : new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target === stageShell) mainSceneVisible = entry.isIntersecting;
      if (entry.target === outroStage) {
        outroSceneVisible = entry.isIntersecting;
        outroScene?.setActive(outroSceneVisible);
      }
    });
  }, { rootMargin: '160px 0px', threshold: 0.01 });

if (sceneVisibilityObserver) {
  sceneVisibilityObserver.observe(stageShell);
  sceneVisibilityObserver.observe(outroStage);
} else {
  mainSceneVisible = true;
  outroSceneVisible = true;
  outroScene?.setActive(true);
}

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
  if (mainSceneVisible) {
    scene?.update(orbital, timestamp);
    fallback?.render(orbital);
  }
  if (outroSceneVisible) outroScene?.update(orbital, timestamp);
  updateReadouts();
  window.requestAnimationFrame(animate);
}

applyTheme(state.theme);
setExploring(false);
setupNarrationPlayer();
updateSoundButton();
syncCameraControls();
syncCameraFraming();
syncConstructionLayoutControl();
updateSurface();
resizeScene();
window.requestAnimationFrame(animate);

window.addEventListener('pagehide', () => {
  if (cameraFramingHudTimer !== undefined) window.clearTimeout(cameraFramingHudTimer);
  resizeObserver.disconnect();
  sceneVisibilityObserver?.disconnect();
  scene?.destroy();
  outroScene?.destroy();
  narrationAudio.pause();
  interfaceTooltips.destroy();
  void audio.destroy();
}, { once: true });

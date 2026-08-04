type InterfaceTooltipId =
  | 'theme'
  | 'narration-nav'
  | 'playback-toggle'
  | 'restart'
  | 'time-scale'
  | 'eccentricity'
  | 'wedge-count'
  | 'camera-proof'
  | 'camera-front'
  | 'camera-overhead'
  | 'camera-side'
  | 'camera-frame-all'
  | 'camera-sun'
  | 'camera-planet'
  | 'camera-hodograph'
  | 'camera-free'
  | 'sound-toggle'
  | 'sound-master'
  | 'sound-gravity'
  | 'sound-hodograph'
  | 'sound-markers'
  | 'story-link'
  | 'narration-play'
  | 'narration-seek';

interface TooltipDefinition {
  label: string;
  explainer: string;
  accent: string;
}

type OpenMode = 'hover' | 'focus' | 'touch';

const HOVER_DELAY_MS = 600;
const TRANSITION_MS = 200;

const TOOLTIP_COPY: Record<InterfaceTooltipId, TooltipDefinition> = {
  theme: {
    label: 'Surface',
    explainer: 'Switch between warm paper and dark chalkboard. Your choice remains local to this browser.',
    accent: 'var(--construction)',
  },
  'narration-nav': {
    label: 'Lost-lecture narration',
    explainer: 'Play or pause the recovered story. Starting it here carries you directly to the narration below.',
    accent: 'var(--hodograph)',
  },
  'playback-toggle': {
    label: 'Shared clock',
    explainer: 'Pause or resume uniform mean-anomaly time. Both mathematical spaces always remain synchronized.',
    accent: 'var(--construction)',
  },
  restart: {
    label: 'Restart orbit',
    explainer: 'Return mean anomaly to zero: perihelion in position space and its matching point on the hodograph.',
    accent: 'var(--orbit)',
  },
  'time-scale': {
    label: 'Time scale',
    explainer: 'Changes how quickly mean anomaly advances without altering the orbit’s geometry or synchronization.',
    accent: 'var(--construction)',
  },
  eccentricity: {
    label: 'Eccentricity · e',
    explainer: 'Controls how elongated the ellipse is. The same value displaces the hodograph centre in velocity space.',
    accent: 'var(--orbit)',
  },
  'wedge-count': {
    label: 'Equal-time resolution',
    explainer: 'Sets how many equal intervals sample one orbit. More wedges refine both swept areas and the velocity-change chain.',
    accent: 'var(--wedge)',
  },
  'camera-proof': {
    label: 'Proof view',
    explainer: 'The composed teaching angle: position and velocity planes remain legible together as one construction.',
    accent: 'var(--construction)',
  },
  'camera-front': {
    label: 'Front view',
    explainer: 'Looks nearly level through the construction to compare the two embedded spaces without an oblique orbit.',
    accent: 'var(--construction)',
  },
  'camera-overhead': {
    label: 'True overhead',
    explainer: 'Looks exactly normal to the orbital plane, showing the ellipse without perspective distortion.',
    accent: 'var(--orbit)',
  },
  'camera-side': {
    label: 'True side',
    explainer: 'Looks exactly along the world X axis, making the right-angle relationship between the two planes explicit.',
    accent: 'var(--hodograph)',
  },
  'camera-frame-all': {
    label: 'Frame all',
    explainer: 'Releases any body lock and fits every visible construction inside a neutral overview.',
    accent: 'var(--construction)',
  },
  'camera-sun': {
    label: 'From Sun',
    explainer: 'Places the eye on the Sun’s surface. The planet begins centred; your first drag takes over free looking.',
    accent: 'var(--sun)',
  },
  'camera-planet': {
    label: 'Orbit with planet',
    explainer: 'Pins the camera target to the moving planet while leaving orbit, pan, and dolly under your control.',
    accent: 'var(--orbit)',
  },
  'camera-hodograph': {
    label: 'Orbit with velocity',
    explainer: 'Pins the camera target to the moving hodograph point so velocity space travels with you.',
    accent: 'var(--hodograph)',
  },
  'camera-free': {
    label: 'Free camera',
    explainer: 'Releases every moving-body attachment and returns camera motion to the shared scene centre.',
    accent: 'var(--vector)',
  },
  'sound-toggle': {
    label: 'Sonification power',
    explainer: 'Enable, mute, or restore the browser-native orbital score. Sound begins only after this explicit action.',
    accent: 'var(--hodograph)',
  },
  'sound-master': {
    label: 'Master level',
    explainer: 'Controls the complete orbital score after all three layers meet the safety compressor.',
    accent: 'var(--construction)',
  },
  'sound-gravity': {
    label: 'Gravity field',
    explainer: 'A fixed low harmonic bed. The inverse-square field raises its level and opens its spectrum near perihelion; its pitch never imitates an engine.',
    accent: 'var(--sun)',
  },
  'sound-hodograph': {
    label: 'Hodograph field',
    explainer: 'Four stationary resonators crossfade with the velocity point’s angle around the circle. Speed changes brightness, not RPM.',
    accent: 'var(--hodograph)',
  },
  'sound-markers': {
    label: 'Boundary pulses',
    explainer: 'Each exact equal-time crossing makes one short, dry pulse. Two damped inharmonic modes change continuously around the hodograph; perihelion and aphelion remain separate landmarks.',
    accent: 'var(--wedge)',
  },
  'story-link': {
    label: 'Continue to the lost lecture',
    explainer: 'Move from the live construction to the recovered story, narration, historical sequence, and sources.',
    accent: 'var(--hodograph)',
  },
  'narration-play': {
    label: 'Narration transport',
    explainer: 'Play or pause Alistair’s reading of the recovered lecture story.',
    accent: 'var(--hodograph)',
  },
  'narration-seek': {
    label: 'Narration position',
    explainer: 'Move to any moment in the four-minute narration without changing the orbital instrument’s clock.',
    accent: 'var(--hodograph)',
  },
};

function tooltipId(element: Element): InterfaceTooltipId | null {
  const value = (element as HTMLElement).dataset.interfaceTooltip;
  return value && value in TOOLTIP_COPY ? value as InterfaceTooltipId : null;
}

export class InterfaceTooltipController {
  private readonly tooltip = document.createElement('div');
  private readonly label = document.createElement('span');
  private readonly body = document.createElement('p');
  private readonly triggers: HTMLElement[];
  private active: HTMLElement | null = null;
  private activeMode: OpenMode | null = null;
  private showTimer: number | null = null;
  private hideTimer: number | null = null;
  private pointerStart: { element: HTMLElement; x: number; y: number; moved: boolean } | null = null;

  constructor(root: ParentNode = document) {
    this.tooltip.className = 'scene-tooltip interface-tooltip';
    this.tooltip.id = 'interface-tooltip';
    this.tooltip.hidden = true;
    this.tooltip.setAttribute('role', 'tooltip');

    const header = document.createElement('div');
    header.className = 'scene-tooltip-header';
    const marker = document.createElement('span');
    marker.className = 'scene-tooltip-marker';
    marker.setAttribute('aria-hidden', 'true');
    header.append(marker, this.label);
    this.body.className = 'scene-tooltip-body';
    this.tooltip.append(header, this.body);
    document.body.append(this.tooltip);

    this.triggers = [...root.querySelectorAll<HTMLElement>('[data-interface-tooltip]')];
    this.triggers.forEach(trigger => {
      trigger.setAttribute('aria-describedby', this.tooltip.id);
      trigger.addEventListener('pointerenter', this.pointerEnter);
      trigger.addEventListener('pointerleave', this.pointerLeave);
      trigger.addEventListener('pointerdown', this.pointerDown);
      trigger.addEventListener('pointermove', this.pointerMove);
      trigger.addEventListener('pointerup', this.pointerUp);
      trigger.addEventListener('pointercancel', this.pointerCancel);
      trigger.addEventListener('focus', this.focus);
      trigger.addEventListener('blur', this.blur);
    });
    document.addEventListener('pointerdown', this.documentPointerDown, true);
    document.addEventListener('keydown', this.keyDown);
    window.addEventListener('resize', this.reposition);
    window.addEventListener('scroll', this.reposition, true);
  }

  destroy(): void {
    if (this.showTimer !== null) window.clearTimeout(this.showTimer);
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.triggers.forEach(trigger => {
      trigger.removeEventListener('pointerenter', this.pointerEnter);
      trigger.removeEventListener('pointerleave', this.pointerLeave);
      trigger.removeEventListener('pointerdown', this.pointerDown);
      trigger.removeEventListener('pointermove', this.pointerMove);
      trigger.removeEventListener('pointerup', this.pointerUp);
      trigger.removeEventListener('pointercancel', this.pointerCancel);
      trigger.removeEventListener('focus', this.focus);
      trigger.removeEventListener('blur', this.blur);
    });
    document.removeEventListener('pointerdown', this.documentPointerDown, true);
    document.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('resize', this.reposition);
    window.removeEventListener('scroll', this.reposition, true);
    this.tooltip.remove();
  }

  hideNow(): void {
    this.hide(true);
  }

  private readonly pointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || window.matchMedia?.('(hover: none)').matches) return;
    this.scheduleHover(event.currentTarget as HTMLElement);
  };

  private readonly pointerLeave = (): void => {
    this.cancelScheduledShow();
    if (this.activeMode === 'hover') this.hide();
  };

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' && !window.matchMedia?.('(pointer: coarse)').matches) return;
    this.pointerStart = {
      element: event.currentTarget as HTMLElement,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.pointerStart) return;
    if (Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 5) {
      this.pointerStart.moved = true;
    }
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || start.moved || start.element !== event.currentTarget) return;
    if (this.active === start.element && this.activeMode === 'touch') this.hide();
    else this.show(start.element, 'touch');
  };

  private readonly pointerCancel = (): void => {
    this.pointerStart = null;
  };

  private readonly focus = (event: FocusEvent): void => {
    this.show(event.currentTarget as HTMLElement, 'focus');
  };

  private readonly blur = (event: FocusEvent): void => {
    if (this.active === event.currentTarget && this.activeMode === 'focus') this.hide();
  };

  private readonly documentPointerDown = (event: PointerEvent): void => {
    if (this.activeMode !== 'touch' || !this.active) return;
    if (event.target instanceof Node && this.active.contains(event.target)) return;
    this.hide();
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.hide();
  };

  private readonly reposition = (): void => {
    if (this.active) this.position(this.active);
  };

  private show(trigger: HTMLElement, mode: OpenMode): void {
    const id = tooltipId(trigger);
    if (!id) return;
    this.cancelScheduledShow();
    const definition = TOOLTIP_COPY[id];
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.active = trigger;
    this.activeMode = mode;
    this.label.textContent = definition.label;
    this.body.textContent = definition.explainer;
    this.tooltip.style.setProperty('--scene-tooltip-accent', definition.accent);
    this.tooltip.hidden = false;
    this.position(trigger);
    window.requestAnimationFrame(() => {
      if (this.active === trigger) this.tooltip.dataset.open = 'true';
    });
  }

  private hide(immediate = false): void {
    this.cancelScheduledShow();
    this.active = null;
    this.activeMode = null;
    this.tooltip.dataset.open = 'false';
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    if (immediate) {
      this.tooltip.hidden = true;
      this.hideTimer = null;
      return;
    }
    this.hideTimer = window.setTimeout(() => {
      if (!this.active) this.tooltip.hidden = true;
      this.hideTimer = null;
    }, TRANSITION_MS);
  }

  private scheduleHover(trigger: HTMLElement): void {
    this.cancelScheduledShow();
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      this.show(trigger, 'hover');
    }, HOVER_DELAY_MS);
  }

  private cancelScheduledShow(): void {
    if (this.showTimer === null) return;
    window.clearTimeout(this.showTimer);
    this.showTimer = null;
  }

  private position(trigger: HTMLElement): void {
    if (this.tooltip.hidden) return;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const pad = 8;
    const gap = 8;
    const width = tooltipRect.width || 224;
    const height = tooltipRect.height || 84;
    let left = triggerRect.left + triggerRect.width / 2 - width / 2;
    let top = triggerRect.top - height - gap;
    let placement = 'above';
    if (top < pad) {
      top = triggerRect.bottom + gap;
      placement = 'below';
    }
    left = Math.min(window.innerWidth - width - pad, Math.max(pad, left));
    top = Math.min(window.innerHeight - height - pad, Math.max(pad, top));
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
    this.tooltip.dataset.placement = placement;
  }
}

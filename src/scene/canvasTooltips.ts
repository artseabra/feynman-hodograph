import * as THREE from 'three';
import type { ThemePalette } from '../types';

export type SceneTooltipId =
  | 'orbital-plane'
  | 'orbit'
  | 'reference-circle'
  | 'equal-time-wedges'
  | 'sun'
  | 'planet'
  | 'radius-vector'
  | 'velocity-plane'
  | 'hodograph-circle'
  | 'hodograph-point'
  | 'hodograph-center'
  | 'center-offset'
  | 'hodograph-radius'
  | 'velocity-change-chain'
  | 'velocity-samples'
  | 'phase-bridge';

type AccentKey = keyof Pick<
  ThemePalette,
  'orbit' | 'sun' | 'hodograph' | 'vector' | 'construction' | 'wedge' | 'grid'
>;

interface TooltipDefinition {
  label: string;
  explainer: string;
  accent: AccentKey;
}

export interface CanvasTooltipTarget {
  id: SceneTooltipId;
  objects: readonly THREE.Object3D[];
  anchor: () => THREE.Vector3;
  priority: number;
}

interface RegisteredTarget extends CanvasTooltipTarget {
  definition: TooltipDefinition;
  hotspot: HTMLButtonElement;
}

type OpenMode = 'hover' | 'pinned' | 'touch' | 'keyboard';

const TOOLTIP_COPY: Record<SceneTooltipId, TooltipDefinition> = {
  'orbital-plane': {
    label: 'Position space',
    explainer: 'The physical orbit and equal-time area construction live on this horizontal plane.',
    accent: 'grid',
  },
  orbit: {
    label: 'Kepler ellipse',
    explainer: 'The planet’s bound position orbit. The Sun sits at one focus rather than at the ellipse’s geometric centre.',
    accent: 'orbit',
  },
  'reference-circle': {
    label: 'Auxiliary circle',
    explainer: 'A geometric reference used to relate uniform mean anomaly to the eccentric anomaly that locates the planet on the ellipse.',
    accent: 'construction',
  },
  'equal-time-wedges': {
    label: 'Equal-time wedges',
    explainer: 'Each ribbon spans the same interval of mean anomaly—and therefore the same time. Conservation of angular momentum makes the swept areas equal.',
    accent: 'wedge',
  },
  sun: {
    label: 'Sun · force centre',
    explainer: 'The source of the inverse-square attraction and one focus of the ellipse. Every radius vector and swept area begins here.',
    accent: 'sun',
  },
  planet: {
    label: 'Planet · current position',
    explainer: 'The orbiting body at the current instant. Its partner point in velocity space advances at exactly the same time.',
    accent: 'orbit',
  },
  'radius-vector': {
    label: 'Radius vector',
    explainer: 'The instantaneous displacement from Sun to planet. Its constant area-sweep rate is Kepler’s second law.',
    accent: 'orbit',
  },
  'velocity-plane': {
    label: 'Velocity space',
    explainer: 'This orthogonal plane is not a second physical orbit. Each point represents an instantaneous velocity vector.',
    accent: 'grid',
  },
  'hodograph-circle': {
    label: 'Hodograph circle',
    explainer: 'For inverse-square motion, the tip of the velocity vector traces a circle—even while the position traces an ellipse.',
    accent: 'hodograph',
  },
  'hodograph-point': {
    label: 'Current velocity',
    explainer: 'The planet’s instantaneous velocity plotted as a point. It is synchronized with the orange planet in position space.',
    accent: 'hodograph',
  },
  'hodograph-center': {
    label: 'Hodograph centre',
    explainer: 'The centre of the velocity circle. Its displacement from the velocity origin carries the orbit’s eccentricity.',
    accent: 'vector',
  },
  'center-offset': {
    label: 'Eccentricity offset',
    explainer: 'The vector from velocity origin to hodograph centre. In these normalized units its magnitude is e / √(1 − e²).',
    accent: 'vector',
  },
  'hodograph-radius': {
    label: 'Hodograph radius',
    explainer: 'The radius from the circle’s displaced centre to the current velocity point—not the full velocity vector from the origin.',
    accent: 'vector',
  },
  'velocity-change-chain': {
    label: 'Velocity-change chain',
    explainer: 'Successive velocity differences are chained tip to tail across equal-time samples. As the sampling is refined, the polygon resolves the circular hodograph.',
    accent: 'hodograph',
  },
  'velocity-samples': {
    label: 'Equal-time velocity samples',
    explainer: 'Each marker is the velocity at one equal-time orbital boundary. The highlighted marker corresponds to the active wedge.',
    accent: 'hodograph',
  },
  'phase-bridge': {
    label: 'Same-instant bridge',
    explainer: 'A correspondence guide between position and velocity space. It marks one shared instant; it is not a force, tether, or physical object.',
    accent: 'construction',
  },
};

function eventIsCoarse(event: PointerEvent): boolean {
  return event.pointerType === 'touch' || window.matchMedia?.('(pointer: coarse)').matches === true;
}

const HOVER_DELAY_MS = 600;
const TRANSITION_MS = 200;

/**
 * A canvas-native adaptation of Luster Portal's tooltip contract.
 *
 * Fine pointers hover; a precise click pins. Coarse pointers tap to pin and
 * ignore scroll/drag gestures. The shell flips and clamps inside the stage,
 * and one tooltip is active at a time. Unlike the Portal original, this
 * instrument deliberately omits blur, shadow, and glow.
 */
export class CanvasTooltipController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tooltip: HTMLDivElement;
  private readonly tooltipLabel: HTMLSpanElement;
  private readonly tooltipBody: HTMLParagraphElement;
  private readonly hotspotLayer: HTMLDivElement;
  private readonly objectTargets = new Map<THREE.Object3D, RegisteredTarget>();
  private targets: RegisteredTarget[] = [];
  private active: RegisteredTarget | null = null;
  private activeMode: OpenMode | null = null;
  private pendingHover: RegisteredTarget | null = null;
  private showTimer: number | null = null;
  private hideTimer: number | null = null;
  private pointerStart: { pointerId: number; x: number; y: number; moved: boolean } | null = null;
  private palette: ThemePalette;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly camera: THREE.PerspectiveCamera,
    palette: ThemePalette,
  ) {
    this.palette = palette;
    this.raycaster.params.Line = { threshold: 0.085 };
    this.raycaster.params.Points = { threshold: 0.1 };

    this.hotspotLayer = document.createElement('div');
    this.hotspotLayer.className = 'scene-tooltip-hotspots';
    this.hotspotLayer.setAttribute('role', 'group');
    this.hotspotLayer.setAttribute('aria-label', 'Construction elements');

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'scene-tooltip';
    this.tooltip.id = 'scene-tooltip';
    this.tooltip.hidden = true;
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.setAttribute('aria-live', 'polite');

    const header = document.createElement('div');
    header.className = 'scene-tooltip-header';
    const marker = document.createElement('span');
    marker.className = 'scene-tooltip-marker';
    marker.setAttribute('aria-hidden', 'true');
    this.tooltipLabel = document.createElement('span');
    header.append(marker, this.tooltipLabel);

    this.tooltipBody = document.createElement('p');
    this.tooltipBody.className = 'scene-tooltip-body';
    this.tooltip.append(header, this.tooltipBody);
    this.host.append(this.hotspotLayer, this.tooltip);

    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerleave', this.pointerLeave);
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('pointercancel', this.pointerCancel);
    document.addEventListener('pointerdown', this.documentPointerDown, true);
    document.addEventListener('keydown', this.keyDown);
  }

  setPalette(palette: ThemePalette): void {
    this.palette = palette;
    this.targets.forEach(target => {
      target.hotspot.style.setProperty('--scene-tooltip-accent', palette[target.definition.accent]);
    });
    if (this.active) this.setAccent(this.active.definition.accent);
  }

  setTargets(targets: readonly CanvasTooltipTarget[]): void {
    this.hide(true);
    this.objectTargets.clear();
    this.hotspotLayer.replaceChildren();
    this.targets = targets.map(target => {
      const definition = TOOLTIP_COPY[target.id];
      const hotspot = document.createElement('button');
      hotspot.className = 'scene-tooltip-hotspot';
      hotspot.type = 'button';
      hotspot.setAttribute('aria-label', `${definition.label}. ${definition.explainer}`);
      hotspot.setAttribute('aria-describedby', this.tooltip.id);
      hotspot.dataset.tooltipId = target.id;
      hotspot.style.setProperty('--scene-tooltip-accent', this.palette[definition.accent]);
      this.hotspotLayer.append(hotspot);

      const registered: RegisteredTarget = { ...target, definition, hotspot };
      target.objects.forEach(object => {
        object.traverse(child => this.objectTargets.set(child, registered));
      });
      hotspot.addEventListener('focus', () => this.show(registered, 'keyboard'));
      hotspot.addEventListener('blur', () => {
        if (this.active === registered && this.activeMode === 'keyboard') this.hide();
      });
      return registered;
    });
  }

  update(): void {
    if (this.targets.length === 0) return;
    const hostRect = this.host.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    this.targets.forEach(target => {
      const screen = this.project(target.anchor(), hostRect, canvasRect);
      target.hotspot.hidden = !screen.visible;
      if (screen.visible) {
        target.hotspot.style.left = `${screen.x}px`;
        target.hotspot.style.top = `${screen.y}px`;
      }
    });

    if (!this.active) return;
    const screen = this.project(this.active.anchor(), hostRect, canvasRect);
    if (!screen.visible) {
      this.hide();
      return;
    }
    this.positionTooltip(screen.x, screen.y, hostRect.width, hostRect.height);
  }

  destroy(): void {
    if (this.showTimer !== null) window.clearTimeout(this.showTimer);
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    document.removeEventListener('pointerdown', this.documentPointerDown, true);
    document.removeEventListener('keydown', this.keyDown);
    this.tooltip.remove();
    this.hotspotLayer.remove();
  }

  private readonly pointerMove = (event: PointerEvent): void => {
    if (this.pointerStart && this.pointerStart.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 5) {
        this.pointerStart.moved = true;
        if (this.activeMode === 'hover') this.hide();
      }
    }
    if (event.buttons !== 0 || eventIsCoarse(event) || this.activeMode === 'pinned' || this.activeMode === 'touch') return;
    const target = this.pick(event.clientX, event.clientY);
    if (target) {
      if (this.active === target && this.activeMode === 'hover') return;
      if (this.activeMode === 'hover') this.hide();
      this.scheduleHover(target);
    } else {
      this.cancelScheduledShow();
      if (this.activeMode === 'hover') this.hide();
    }
  };

  private readonly pointerLeave = (): void => {
    this.cancelScheduledShow();
    if (this.activeMode === 'hover') this.hide();
  };

  private readonly pointerDown = (event: PointerEvent): void => {
    this.cancelScheduledShow();
    this.pointerStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || start.pointerId !== event.pointerId || start.moved) return;
    const target = this.pick(event.clientX, event.clientY);
    const mode: OpenMode = eventIsCoarse(event) ? 'touch' : 'pinned';
    if (!target) {
      if (this.activeMode === 'pinned' || this.activeMode === 'touch') this.hide();
      return;
    }
    if (this.active === target && (this.activeMode === 'pinned' || this.activeMode === 'touch')) {
      this.hide();
      return;
    }
    this.show(target, mode);
  };

  private readonly pointerCancel = (): void => {
    this.pointerStart = null;
  };

  private readonly documentPointerDown = (event: PointerEvent): void => {
    if (this.activeMode !== 'pinned' && this.activeMode !== 'touch') return;
    if (event.target === this.canvas) return;
    if (event.target instanceof Node && this.hotspotLayer.contains(event.target)) return;
    this.hide();
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.hide();
  };

  private pick(clientX: number, clientY: number): RegisteredTarget | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointer.set(
      (clientX - rect.left) / rect.width * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.targets.flatMap(target => [...target.objects]), true);
    let best: { target: RegisteredTarget; distance: number } | null = null;
    for (const intersection of intersections) {
      if (!this.isEffectivelyVisible(intersection.object)) continue;
      const target = this.objectTargets.get(intersection.object);
      if (!target) continue;
      if (
        !best
        || target.priority > best.target.priority
        || (target.priority === best.target.priority && intersection.distance < best.distance)
      ) {
        best = { target, distance: intersection.distance };
      }
    }
    return best?.target ?? null;
  }

  private isEffectivelyVisible(object: THREE.Object3D): boolean {
    let candidate: THREE.Object3D | null = object;
    while (candidate) {
      if (!candidate.visible) return false;
      candidate = candidate.parent;
    }
    return true;
  }

  private show(target: RegisteredTarget, mode: OpenMode): void {
    this.cancelScheduledShow();
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    const changed = this.active !== target;
    this.active = target;
    this.activeMode = mode;
    if (changed) {
      this.tooltipLabel.textContent = target.definition.label;
      this.tooltipBody.textContent = target.definition.explainer;
      this.setAccent(target.definition.accent);
    }
    this.tooltip.hidden = false;
    window.requestAnimationFrame(() => {
      if (this.active === target) this.tooltip.dataset.open = 'true';
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

  private scheduleHover(target: RegisteredTarget): void {
    if (this.pendingHover === target && this.showTimer !== null) return;
    this.cancelScheduledShow();
    this.pendingHover = target;
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      this.pendingHover = null;
      this.show(target, 'hover');
    }, HOVER_DELAY_MS);
  }

  private cancelScheduledShow(): void {
    if (this.showTimer !== null) window.clearTimeout(this.showTimer);
    this.showTimer = null;
    this.pendingHover = null;
  }

  private setAccent(key: AccentKey): void {
    this.tooltip.style.setProperty('--scene-tooltip-accent', this.palette[key]);
  }

  private project(
    world: THREE.Vector3,
    hostRect: DOMRect,
    canvasRect: DOMRect,
  ): { x: number; y: number; visible: boolean } {
    const projected = world.clone().project(this.camera);
    const visible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1.08 && Math.abs(projected.y) <= 1.08;
    return {
      x: canvasRect.left - hostRect.left + (projected.x + 1) * 0.5 * canvasRect.width,
      y: canvasRect.top - hostRect.top + (1 - projected.y) * 0.5 * canvasRect.height,
      visible,
    };
  }

  private positionTooltip(x: number, y: number, width: number, height: number): void {
    if (this.tooltip.hidden) return;
    const bounds = this.tooltip.getBoundingClientRect();
    const pad = 10;
    const gap = 11;
    const tooltipWidth = Math.min(bounds.width || 224, Math.max(0, width - pad * 2));
    const tooltipHeight = bounds.height || 84;
    let left = x - tooltipWidth / 2;
    let top = y - tooltipHeight - gap;
    let placement = 'above';
    if (top < pad) {
      top = y + gap;
      placement = 'below';
    }
    left = THREE.MathUtils.clamp(left, pad, Math.max(pad, width - tooltipWidth - pad));
    top = THREE.MathUtils.clamp(top, pad, Math.max(pad, height - tooltipHeight - pad));
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
    this.tooltip.dataset.placement = placement;
  }
}

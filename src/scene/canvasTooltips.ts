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
  /** Anchor pointer tooltips to the picked member of a grouped target. */
  anchorAtIntersection?: boolean;
  priority: number;
}

interface RegisteredTarget extends CanvasTooltipTarget {
  definition: TooltipDefinition;
  hotspot: HTMLButtonElement;
}

interface PickedTarget {
  target: RegisteredTarget;
  anchor: THREE.Vector3 | null;
}

type OpenMode = 'hover' | 'touch' | 'keyboard';

export interface TooltipHitCandidate<T> {
  target: T;
  distance: number;
  priority: number;
}

/**
 * Intersections this close together are treated as parts of one visual layer,
 * so a specific proof object can win over the broad plane or line beneath it.
 * Outside that narrow band, the genuinely frontmost surface always wins.
 */
export const TOOLTIP_NEAR_DEPTH_TOLERANCE = 0.04;

export function selectTooltipCandidate<T>(
  candidates: readonly TooltipHitCandidate<T>[],
  nearDepthTolerance = TOOLTIP_NEAR_DEPTH_TOLERANCE,
): TooltipHitCandidate<T> | null {
  const validCandidates = candidates.filter(candidate => (
    Number.isFinite(candidate.distance) && candidate.distance >= 0
  ));
  if (validCandidates.length === 0) return null;

  const nearestDistance = Math.min(...validCandidates.map(candidate => candidate.distance));
  const tolerance = Math.max(0, nearDepthTolerance);
  const nearCandidates = validCandidates.filter(candidate => (
    candidate.distance <= nearestDistance + tolerance
  ));

  return nearCandidates.reduce((best, candidate) => {
    if (candidate.priority !== best.priority) {
      return candidate.priority > best.priority ? candidate : best;
    }
    return candidate.distance < best.distance ? candidate : best;
  });
}

const TOOLTIP_COPY: Record<SceneTooltipId, TooltipDefinition> = {
  'orbital-plane': {
    label: 'Position space',
    explainer: 'Here lie the Sun, radius vector, equal-time wedges, and the orbit whose shape must be recovered. The decisive proof move comes after translating the motion into velocity space.',
    accent: 'grid',
  },
  orbit: {
    label: 'Orbit · result to recover',
    explainer: 'The ellipse is the result, not the proof’s starting mechanism. The construction must show why an inverse-square pull about the Sun produces this position trace.',
    accent: 'orbit',
  },
  'reference-circle': {
    label: 'Auxiliary circle',
    explainer: 'The ellipse can be read as this circle flattened in one direction. At e = 0 they coincide exactly; near that circular limit the instrument omits a redundant second stroke.',
    accent: 'construction',
  },
  'equal-time-wedges': {
    label: 'Equal-time wedges',
    explainer: 'Kepler’s area law makes the Sun-to-planet line sweep equal areas in equal times. Those matched intervals let the inverse-square changes of velocity be compared and chained.',
    accent: 'wedge',
  },
  sun: {
    label: 'Sun · force centre',
    explainer: 'Every short change of velocity points toward this inverse-square force centre. The changing Sunward directions become the geometry of the velocity-space construction.',
    accent: 'sun',
  },
  planet: {
    label: 'Planet · position event',
    explainer: 'The orange planet and the blue velocity point show one event twice. Here the event is located in position space; above, the same instant is translated into velocity.',
    accent: 'orbit',
  },
  'radius-vector': {
    label: 'Radius vector',
    explainer: 'This Sun-to-planet line fixes the force direction and sweeps the equal areas of Kepler’s time law. Together those constraints determine each step in the velocity-change argument.',
    accent: 'orbit',
  },
  'velocity-plane': {
    label: 'Velocity space',
    explainer: 'The proof stops asking only where the planet is and instead chains how its velocity changes. In this translated space, the inverse-square dynamics expose a circle.',
    accent: 'grid',
  },
  'hodograph-circle': {
    label: 'Hodograph circle',
    explainer: 'The inverse-square changes accumulated over matched time steps make the velocity tip trace a circle. That circle is the proof engine from which the position-space ellipse can be recovered.',
    accent: 'hodograph',
  },
  'hodograph-point': {
    label: 'Velocity point · same event',
    explainer: 'The blue point is the orange planet’s instantaneous velocity. They are one orbital event shown twice: once as position and once as velocity.',
    accent: 'vector',
  },
  'hodograph-center': {
    label: 'Hodograph centre',
    explainer: 'The circle’s centre is offset from the velocity origin so that offset divided by radius equals e. At e = 0 the centre and origin coincide; increasing eccentricity separates them.',
    accent: 'vector',
  },
  'hodograph-radius': {
    label: 'Hodograph radius',
    explainer: 'This constant segment runs from the displaced circle centre to the blue velocity point. It is not the full velocity vector, which begins at the velocity-space origin.',
    accent: 'vector',
  },
  'velocity-change-chain': {
    label: 'Inverse-square proof chain',
    explainer: 'Each segment is the Sun-directed change of velocity over an equal-time step. Chained head to tail, the inverse-square increments reveal the circular hodograph hidden behind the orbit.',
    accent: 'hodograph',
  },
  'velocity-samples': {
    label: 'Equal-time velocity samples',
    explainer: 'Each marker is synchronized with one equal-time event in the position-space wedges. Their ordered differences form the velocity-change chain that reveals the circle.',
    accent: 'hodograph',
  },
  'phase-bridge': {
    label: 'Editorial correspondence',
    explainer: 'This dashed bridge says only that the orange planet and blue velocity point share an instant. It is an editorial guide in this instrument, not a physical tether, force, or path.',
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
 * Fine pointers hover without pinning; coarse pointers tap to pin and ignore
 * scroll/drag gestures. The shell flips and clamps inside the stage, and one
 * tooltip is active at a time. Unlike the Portal original, this instrument
 * deliberately omits blur, shadow, and glow.
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
  private activeAnchor: THREE.Vector3 | null = null;
  private activeMode: OpenMode | null = null;
  private pendingHover: PickedTarget | null = null;
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
    // Every keyboard hotspot owns its stable accessible name and description.
    // This floating duplicate is visual only, so focus never announces the
    // same copy again as a shared tooltip or live region.
    this.tooltip.setAttribute('aria-hidden', 'true');

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
    this.targets = targets.map((target, index) => {
      const definition = TOOLTIP_COPY[target.id];
      const hotspot = document.createElement('button');
      hotspot.className = 'scene-tooltip-hotspot';
      hotspot.type = 'button';
      hotspot.setAttribute('aria-label', definition.label);
      hotspot.dataset.tooltipId = target.id;
      hotspot.style.setProperty('--scene-tooltip-accent', this.palette[definition.accent]);

      const description = document.createElement('span');
      description.className = 'sr-only';
      description.id = `scene-tooltip-description-${target.id}-${index}`;
      description.textContent = definition.explainer;
      hotspot.setAttribute('aria-describedby', description.id);
      hotspot.append(description);
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
    const screen = this.project(this.activeAnchor ?? this.active.anchor(), hostRect, canvasRect);
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
    if (event.buttons !== 0 || eventIsCoarse(event) || this.activeMode === 'touch') return;
    const picked = this.pick(event.clientX, event.clientY);
    if (picked) {
      if (this.active === picked.target && this.activeMode === 'hover') {
        this.activeAnchor = picked.anchor;
        return;
      }
      if (this.activeMode === 'hover') this.hide();
      this.scheduleHover(picked);
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
    if (!eventIsCoarse(event) && this.activeMode === 'hover') this.hide();
    this.pointerStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || start.pointerId !== event.pointerId || start.moved) return;
    if (!eventIsCoarse(event)) return;
    const picked = this.pick(event.clientX, event.clientY);
    if (!picked) {
      if (this.activeMode === 'touch') this.hide();
      return;
    }
    if (this.active === picked.target && this.activeMode === 'touch') {
      this.hide();
      return;
    }
    this.show(picked.target, 'touch', picked.anchor);
  };

  private readonly pointerCancel = (): void => {
    this.pointerStart = null;
  };

  private readonly documentPointerDown = (event: PointerEvent): void => {
    if (this.activeMode !== 'touch') return;
    if (event.target === this.canvas) return;
    if (event.target instanceof Node && this.hotspotLayer.contains(event.target)) return;
    this.hide();
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.hide();
  };

  private pick(clientX: number, clientY: number): PickedTarget | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointer.set(
      (clientX - rect.left) / rect.width * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.targets.flatMap(target => [...target.objects]), true);
    const candidates: TooltipHitCandidate<PickedTarget>[] = [];
    for (const intersection of intersections) {
      if (!this.isEffectivelyVisible(intersection.object)) continue;
      const target = this.objectTargets.get(intersection.object);
      if (!target) continue;
      candidates.push({
        target: {
          target,
          anchor: target.anchorAtIntersection ? intersection.point.clone() : null,
        },
        distance: intersection.distance,
        priority: target.priority,
      });
    }
    const best = selectTooltipCandidate(candidates);
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

  private show(
    target: RegisteredTarget,
    mode: OpenMode,
    anchor: THREE.Vector3 | null = null,
  ): void {
    this.cancelScheduledShow();
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    const changed = this.active !== target;
    this.active = target;
    this.activeAnchor = anchor;
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
    this.activeAnchor = null;
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

  private scheduleHover(picked: PickedTarget): void {
    if (this.pendingHover?.target === picked.target && this.showTimer !== null) {
      this.pendingHover = picked;
      return;
    }
    this.cancelScheduledShow();
    this.pendingHover = picked;
    this.showTimer = window.setTimeout(() => {
      const pending = this.pendingHover;
      this.showTimer = null;
      this.pendingHover = null;
      if (pending) this.show(pending.target, 'hover', pending.anchor);
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

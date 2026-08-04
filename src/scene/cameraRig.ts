import * as THREE from 'three';
import type { CameraView, SceneBounds } from '../types';

const INTENT_DELAY_MS = 90;
const INTENT_DISTANCE_PX = 4;
const HALF_PI = Math.PI / 2;
const MAX_FREE_PITCH = HALF_PI - 0.01;
const BASE_FOV = 42;
const POV_EYE_RADIUS = 0.285;
const POV_REFERENCE_DISTANCE = 4.15;
// Wide enough to hold the surrounding construction from the focus, but not so
// wide that the spatial proof turns into a fisheye caricature.
const POV_BASE_FOV = 70;
const POV_MIN_FOV = 38;
const POV_MAX_FOV = 88;
const POV_MIN_DISTANCE = POV_REFERENCE_DISTANCE * POV_MIN_FOV / POV_BASE_FOV;
const POV_MAX_DISTANCE = POV_REFERENCE_DISTANCE * POV_MAX_FOV / POV_BASE_FOV;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TOP_DOWN_UP = new THREE.Vector3(0, 0, -1);
const BOTTOM_UP_UP = new THREE.Vector3(0, 0, 1);

export function shouldDollyFromWheel(exploring: boolean): boolean {
  return exploring;
}

// Each preset answers a different question about the construction. Overhead
// is genuinely normal to the orbital plane; side is genuinely normal to the
// world X axis. The oblique proof and overview are deliberately separate.
const CAMERA_PRESETS: Record<CameraView, { yaw: number; pitch: number }> = {
  proof: { yaw: -0.58, pitch: 0.34 },
  front: { yaw: 0.02, pitch: 0.06 },
  overhead: { yaw: 0, pitch: HALF_PI },
  side: { yaw: HALF_PI, pitch: 0 },
};

const OVERVIEW_PRESET = { yaw: 0.72, pitch: 0.54 };

export function cameraPresetOrientation(view: CameraView): { yaw: number; pitch: number } {
  return { ...CAMERA_PRESETS[view] };
}

export class CameraRig {
  private readonly target = new THREE.Vector3();
  private readonly targetGoal = new THREE.Vector3();
  private readonly followOffset = new THREE.Vector3();
  private readonly pointOfViewEyeDirection = new THREE.Vector3(0, 0, 1);
  private followMode: 'none' | 'target' | 'point-of-view' = 'none';
  private pointOfViewTracksSubject = false;
  private yaw = CAMERA_PRESETS.proof.yaw;
  private yawGoal = CAMERA_PRESETS.proof.yaw;
  private pitch = CAMERA_PRESETS.proof.pitch;
  private pitchGoal = CAMERA_PRESETS.proof.pitch;
  private distance = 15;
  private distanceGoal = 15;
  private minimumDistance = 3;
  private maximumDistance = 40;

  fit(bounds: SceneBounds, camera: THREE.PerspectiveCamera, aspect: number): void {
    if (this.followMode === 'point-of-view') {
      this.minimumDistance = POV_MIN_DISTANCE;
      this.maximumDistance = POV_MAX_DISTANCE;
      return;
    }
    if (camera.fov !== BASE_FOV) {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
    }
    const fovRadians = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(fovRadians / 2) * aspect);
    const { forward, right, up } = this.basisAt(this.yawGoal, this.pitchGoal);
    const horizontalTangent = Math.tan(horizontalFov / 2);
    const verticalTangent = Math.tan(fovRadians / 2);
    const center = new THREE.Vector3(bounds.center.x, bounds.center.y, bounds.center.z);
    const corners = [bounds.min.x, bounds.max.x].flatMap(x =>
      [bounds.min.y, bounds.max.y].flatMap(y =>
        [bounds.min.z, bounds.max.z].map(z => new THREE.Vector3(x, y, z).sub(center)),
      ),
    );

    // A bounding sphere is safe but visually wasteful for two perpendicular
    // planes. Solve against the projected AABB corners at the active view
    // instead: every construction remains in frame while the proof occupies
    // the stage as a spatial instrument rather than a tiny tabletop diorama.
    const requiredDistance = corners.reduce((distance, corner) => {
      const depthOffset = corner.dot(forward);
      const horizontal = Math.abs(corner.dot(right)) / horizontalTangent - depthOffset;
      const vertical = Math.abs(corner.dot(up)) / verticalTangent - depthOffset;
      return Math.max(distance, horizontal, vertical, 0.3 - depthOffset);
    }, 0.1);
    // Projected bounds have already accounted for the active camera basis.
    // Keep a deliberate but tight breathing margin so the construction reads
    // as an instrument rather than a small object in a large stage.
    const distance = requiredDistance * 1.045;

    this.minimumDistance = Math.max(0.55, requiredDistance * 0.14);
    this.maximumDistance = Math.max(distance * 6, bounds.radius * 8);
    if (this.followMode === 'none') {
      this.targetGoal.set(bounds.center.x, bounds.center.y, bounds.center.z);
      this.distanceGoal = THREE.MathUtils.clamp(distance, this.minimumDistance, this.maximumDistance);
    }
  }

  orbit(deltaX: number, deltaY: number): void {
    if (this.followMode === 'point-of-view') {
      // The initial Sun view keeps the planet centred. The first deliberate
      // look gesture hands orientation to the visitor and stops auto-tracking
      // until From Sun is selected again.
      this.pointOfViewTracksSubject = false;
      // Orbit mode moves a camera around a target; point-of-view mode turns
      // the eye itself. Horizontal direct-look follows screen space: pull
      // right to look right and pull left to look left. Keep vertical drag
      // consistent with the rest of this instrument: pull up to tilt down.
      this.yawGoal -= deltaX * 0.0075;
      this.pitchGoal = THREE.MathUtils.clamp(this.pitchGoal + deltaY * 0.0065, -MAX_FREE_PITCH, MAX_FREE_PITCH);
      return;
    }
    this.yawGoal -= deltaX * 0.0075;
    // Match the direct-manipulation expectation: dragging down lowers the
    // view toward the ground rather than lifting it away from the scene.
    this.pitchGoal = THREE.MathUtils.clamp(this.pitchGoal + deltaY * 0.0065, -MAX_FREE_PITCH, MAX_FREE_PITCH);
  }

  pan(deltaX: number, deltaY: number, camera: THREE.PerspectiveCamera): void {
    if (this.followMode === 'point-of-view') this.pointOfViewTracksSubject = false;
    const scale = this.distanceGoal * 0.00145;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const target = this.followMode !== 'none' ? this.followOffset : this.targetGoal;
    target.addScaledVector(right, -deltaX * scale);
    target.addScaledVector(up, deltaY * scale);
  }

  dolly(delta: number): void {
    const multiplier = Math.exp(delta * 0.0018);
    this.distanceGoal = THREE.MathUtils.clamp(
      this.distanceGoal * multiplier,
      this.minimumDistance,
      this.maximumDistance,
    );
  }

  setView(view: CameraView): void {
    this.releaseFollow();
    this.setOrientation(CAMERA_PRESETS[view], true);
  }

  frameAll(): void {
    this.releaseFollow();
    this.setOrientation(OVERVIEW_PRESET, true);
  }

  beginFollow(
    point: THREE.Vector3,
    distance: number,
    orientation?: { yaw: number; pitch: number },
  ): void {
    this.followMode = 'target';
    this.followOffset.set(0, 0, 0);
    if (orientation) this.setOrientation(orientation);
    this.minimumDistance = Math.min(this.minimumDistance, 0.7);
    this.maximumDistance = Math.max(this.maximumDistance, distance * 5);
    this.distanceGoal = THREE.MathUtils.clamp(distance, this.minimumDistance, this.maximumDistance);
    this.trackFollow(point);
  }

  trackFollow(point: THREE.Vector3): void {
    if (this.followMode !== 'target') return;
    this.targetGoal.copy(point).add(this.followOffset);
    // A companion view is attached to its chosen body, not delayed behind it.
    this.target.copy(this.targetGoal);
  }

  releaseFollow(): void {
    this.followMode = 'none';
    this.pointOfViewTracksSubject = false;
    this.followOffset.set(0, 0, 0);
  }

  /**
   * A body-relative camera is not an orbit camera pointed at that body. The
   * eye begins just outside its rendered surface and looks through the scene.
   * The user still owns yaw, pitch, dolly (as lens zoom), and local pan.
   */
  beginPointOfView(anchor: THREE.Vector3, initialSubject: THREE.Vector3): void {
    this.followMode = 'point-of-view';
    this.pointOfViewTracksSubject = true;
    this.followOffset.set(0, 0, 0);
    this.minimumDistance = POV_MIN_DISTANCE;
    this.maximumDistance = POV_MAX_DISTANCE;
    this.distance = POV_REFERENCE_DISTANCE;
    this.distanceGoal = POV_REFERENCE_DISTANCE;
    this.trackPointOfView(anchor, initialSubject);
  }

  trackPointOfView(anchor: THREE.Vector3, subject?: THREE.Vector3): void {
    if (this.followMode !== 'point-of-view') return;
    this.targetGoal.copy(anchor).add(this.followOffset);
    // An anchored point of view must move with its body immediately; otherwise
    // the eye seems to lag behind the physical point it claims to inhabit.
    this.target.copy(this.targetGoal);
    if (!this.pointOfViewTracksSubject || !subject) return;

    const direction = subject.clone().sub(anchor);
    if (direction.lengthSq() <= 1e-8) return;
    direction.normalize();
    this.pointOfViewEyeDirection.copy(direction);
    this.setOrientation({
      yaw: Math.atan2(direction.x, direction.z),
      pitch: Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)),
    }, true);
  }

  private setOrientation({ yaw, pitch }: { yaw: number; pitch: number }, snap = false): void {
    this.yawGoal = yaw;
    this.pitchGoal = pitch;
    if (snap) {
      this.yaw = yaw;
      this.pitch = pitch;
    }
  }

  private basisAt(yaw: number, pitch: number): {
    forward: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
  } {
    const cosPitch = Math.cos(pitch);
    const offset = new THREE.Vector3(
      Math.sin(yaw) * cosPitch,
      Math.sin(pitch),
      Math.cos(yaw) * cosPitch,
    ).normalize();
    const forward = offset.clone().negate();
    // `forward` and world-up are collinear for the exact overhead preset.
    // Choose an explicit screen-up axis there so projected bounds stay finite
    // and the camera has a stable, literal top-down orientation.
    const referenceUp = Math.abs(forward.y) > 0.9999
      ? (forward.y < 0 ? TOP_DOWN_UP : BOTTOM_UP_UP)
      : WORLD_UP;
    const right = new THREE.Vector3().crossVectors(forward, referenceUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    return { forward, right, up };
  }

  update(camera: THREE.PerspectiveCamera, deltaSeconds: number): void {
    const damping = 1 - Math.exp(-Math.min(deltaSeconds, 0.1) * 8);
    this.target.lerp(this.targetGoal, damping);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.yawGoal, damping);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.pitchGoal, damping);
    this.distance = THREE.MathUtils.lerp(this.distance, this.distanceGoal, damping);

    const cosPitch = Math.cos(this.pitch);
    const viewDirection = new THREE.Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    ).normalize();

    if (this.followMode === 'point-of-view') {
      const fov = THREE.MathUtils.clamp(
        POV_BASE_FOV * (this.distance / POV_REFERENCE_DISTANCE),
        POV_MIN_FOV,
        POV_MAX_FOV,
      );
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      // Eye placement and look direction are deliberately separate. Turning
      // your head must not slide the camera around the Sun's surface.
      camera.position.copy(this.target).addScaledVector(this.pointOfViewEyeDirection, POV_EYE_RADIUS);
      camera.up.copy(Math.abs(Math.abs(this.pitch) - HALF_PI) < 0.001
        ? (this.pitch >= 0 ? TOP_DOWN_UP : BOTTOM_UP_UP)
        : WORLD_UP);
      camera.lookAt(camera.position.clone().add(viewDirection));
      return;
    }

    if (camera.fov !== BASE_FOV) {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
    }
    camera.position.set(
      this.target.x + this.distance * viewDirection.x,
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * viewDirection.z,
    );
    // A literal overhead view needs a non-collinear camera-up vector. Without
    // this, Three.js has to invent a roll at the singularity.
    if (Math.abs(Math.abs(this.pitch) - HALF_PI) < 0.001) {
      camera.up.copy(this.pitch >= 0 ? TOP_DOWN_UP : BOTTOM_UP_UP);
    } else {
      camera.up.copy(WORLD_UP);
    }
    camera.lookAt(this.target);
  }
}

type GestureMode = 'orbit' | 'pan';

interface PointerState {
  pointerId: number;
  startedAt: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  mode: GestureMode;
  activated: boolean;
}

export class CameraGestureController {
  private readonly pointers = new Map<number, PointerState>();
  private pinchDistance = 0;
  private pinchMidpoint = new THREE.Vector2();
  private exploring = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly rig: CameraRig,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onInteraction: () => void,
  ) {
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerFinish);
    canvas.addEventListener('pointercancel', this.pointerFinish);
    canvas.addEventListener('lostpointercapture', this.pointerFinish);
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('wheel', this.wheel, { passive: false });
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerFinish);
    this.canvas.removeEventListener('pointercancel', this.pointerFinish);
    this.canvas.removeEventListener('lostpointercapture', this.pointerFinish);
    this.canvas.removeEventListener('wheel', this.wheel);
  }

  setExploring(exploring: boolean): void {
    this.exploring = exploring;
    this.canvas.style.touchAction = exploring ? 'none' : 'pan-y';
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    const mode: GestureMode = event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
    const state: PointerState = {
      pointerId: event.pointerId,
      startedAt: performance.now(),
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      mode,
      activated: false,
    };
    this.pointers.set(event.pointerId, state);
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePinchState();
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;

    if (this.pointers.size >= 2) {
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      this.handlePinch();
      return;
    }

    const totalDistance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    const elapsed = performance.now() - pointer.startedAt;
    if (!pointer.activated && (elapsed < INTENT_DELAY_MS || totalDistance <= INTENT_DISTANCE_PX)) {
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      return;
    }

    pointer.activated = true;
    const deltaX = event.clientX - pointer.lastX;
    const deltaY = event.clientY - pointer.lastY;
    const mode: GestureMode = pointer.mode === 'pan' || event.shiftKey || (event.buttons & 2) !== 0 ? 'pan' : 'orbit';
    if (mode === 'pan') {
      this.rig.pan(deltaX, deltaY, this.camera);
    } else {
      this.rig.orbit(deltaX, deltaY);
    }
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    this.onInteraction();
  };

  private readonly pointerFinish = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.pointers.size === 0) delete this.canvas.dataset.interacting;
    this.updatePinchState();
  };

  private readonly wheel = (event: WheelEvent): void => {
    // The page owns the first scroll. Once the visitor has intentionally
    // entered the canvas, the canvas owns plain scroll until they click away.
    if (!shouldDollyFromWheel(this.exploring)) return;
    event.preventDefault();
    this.rig.dolly(event.deltaY);
    this.onInteraction();
  };

  private updatePinchState(): void {
    if (this.pointers.size !== 2) {
      this.pinchDistance = 0;
      return;
    }
    const [first, second] = [...this.pointers.values()];
    this.pinchDistance = Math.hypot(first.lastX - second.lastX, first.lastY - second.lastY);
    this.pinchMidpoint.set((first.lastX + second.lastX) / 2, (first.lastY + second.lastY) / 2);
  }

  private handlePinch(): void {
    if (!this.exploring) return;
    const [first, second] = [...this.pointers.values()];
    const nextDistance = Math.hypot(first.lastX - second.lastX, first.lastY - second.lastY);
    const nextMidpoint = new THREE.Vector2((first.lastX + second.lastX) / 2, (first.lastY + second.lastY) / 2);

    if (this.pinchDistance > 0 && nextDistance > 0) {
      this.rig.dolly((this.pinchDistance - nextDistance) * 2.1);
      this.rig.pan(nextMidpoint.x - this.pinchMidpoint.x, nextMidpoint.y - this.pinchMidpoint.y, this.camera);
      this.onInteraction();
    }
    this.pinchDistance = nextDistance;
    this.pinchMidpoint.copy(nextMidpoint);
  }
}

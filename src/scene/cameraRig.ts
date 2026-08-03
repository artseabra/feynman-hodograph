import * as THREE from 'three';
import type { CameraView, SceneBounds } from '../types';

const INTENT_DELAY_MS = 90;
const INTENT_DISTANCE_PX = 4;

// Each preset answers a different question about the construction: the
// composed proof, the velocity face, the orbital plan, the orthogonality
// side, and the neutral complete overview.
const CAMERA_PRESETS: Record<CameraView, { yaw: number; pitch: number }> = {
  proof: { yaw: -0.58, pitch: 0.34 },
  front: { yaw: 0.02, pitch: 0.06 },
  overhead: { yaw: -0.24, pitch: 1.12 },
  side: { yaw: 1.46, pitch: 0.16 },
};

const OVERVIEW_PRESET = { yaw: 0.72, pitch: 0.54 };

export class CameraRig {
  private readonly target = new THREE.Vector3();
  private readonly targetGoal = new THREE.Vector3();
  private readonly followOffset = new THREE.Vector3();
  private following = false;
  private yaw = CAMERA_PRESETS.proof.yaw;
  private yawGoal = CAMERA_PRESETS.proof.yaw;
  private pitch = CAMERA_PRESETS.proof.pitch;
  private pitchGoal = CAMERA_PRESETS.proof.pitch;
  private distance = 15;
  private distanceGoal = 15;
  private minimumDistance = 3;
  private maximumDistance = 40;

  fit(bounds: SceneBounds, camera: THREE.PerspectiveCamera, aspect: number): void {
    const fovRadians = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(fovRadians / 2) * aspect);
    const cosPitch = Math.cos(this.pitchGoal);
    const cameraOffset = new THREE.Vector3(
      Math.sin(this.yawGoal) * cosPitch,
      Math.sin(this.pitchGoal),
      Math.cos(this.yawGoal) * cosPitch,
    ).normalize();
    const forward = cameraOffset.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
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
    const distance = requiredDistance * 1.13;

    this.minimumDistance = Math.max(1.8, requiredDistance * 0.5);
    this.maximumDistance = Math.max(distance * 4, bounds.radius * 6);
    if (!this.following) {
      this.targetGoal.set(bounds.center.x, bounds.center.y, bounds.center.z);
      this.distanceGoal = THREE.MathUtils.clamp(distance, this.minimumDistance, this.maximumDistance);
    }
  }

  orbit(deltaX: number, deltaY: number): void {
    this.yawGoal -= deltaX * 0.0075;
    this.pitchGoal = THREE.MathUtils.clamp(this.pitchGoal - deltaY * 0.0065, -1.22, 1.22);
  }

  pan(deltaX: number, deltaY: number, camera: THREE.PerspectiveCamera): void {
    const scale = this.distanceGoal * 0.00145;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const target = this.following ? this.followOffset : this.targetGoal;
    target.addScaledVector(right, -deltaX * scale);
    target.addScaledVector(up, deltaY * scale);
  }

  dolly(delta: number): void {
    const multiplier = Math.exp(delta * 0.0012);
    this.distanceGoal = THREE.MathUtils.clamp(
      this.distanceGoal * multiplier,
      this.minimumDistance,
      this.maximumDistance,
    );
  }

  setView(view: CameraView): void {
    this.releaseFollow();
    this.setOrientation(CAMERA_PRESETS[view]);
  }

  frameAll(): void {
    this.releaseFollow();
    this.setOrientation(OVERVIEW_PRESET);
  }

  beginFollow(
    point: THREE.Vector3,
    distance: number,
    orientation?: { yaw: number; pitch: number },
  ): void {
    this.following = true;
    this.followOffset.set(0, 0, 0);
    if (orientation) this.setOrientation(orientation);
    this.minimumDistance = Math.min(this.minimumDistance, 2.45);
    this.maximumDistance = Math.max(this.maximumDistance, distance * 5);
    this.distanceGoal = THREE.MathUtils.clamp(distance, this.minimumDistance, this.maximumDistance);
    this.trackFollow(point);
  }

  trackFollow(point: THREE.Vector3): void {
    if (!this.following) return;
    this.targetGoal.copy(point).add(this.followOffset);
    // A companion view is attached to its chosen body, not delayed behind it.
    this.target.copy(this.targetGoal);
  }

  releaseFollow(): void {
    this.following = false;
    this.followOffset.set(0, 0, 0);
  }

  private setOrientation({ yaw, pitch }: { yaw: number; pitch: number }): void {
    this.yawGoal = yaw;
    this.pitchGoal = pitch;
  }

  update(camera: THREE.PerspectiveCamera, deltaSeconds: number): void {
    const damping = 1 - Math.exp(-Math.min(deltaSeconds, 0.1) * 8);
    this.target.lerp(this.targetGoal, damping);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.yawGoal, damping);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.pitchGoal, damping);
    this.distance = THREE.MathUtils.lerp(this.distance, this.distanceGoal, damping);

    const cosPitch = Math.cos(this.pitch);
    camera.position.set(
      this.target.x + this.distance * Math.sin(this.yaw) * cosPitch,
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * Math.cos(this.yaw) * cosPitch,
    );
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly rig: CameraRig,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onInteraction: () => void,
  ) {
    canvas.style.touchAction = 'none';
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

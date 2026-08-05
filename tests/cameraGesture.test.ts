import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeInstrumentBounds } from '../src/model/bounds';
import { MAX_ECCENTRICITY } from '../src/model/orbit';
import {
  AUTHORED_SPATIAL_CAMERA,
  CameraRig,
  cameraPresetOrientation,
  shouldDollyFromWheel,
} from '../src/scene/cameraRig';

describe('camera wheel ownership', () => {
  it('leaves ordinary entry scrolling to the document', () => {
    expect(shouldDollyFromWheel(false)).toBe(false);
  });

  it('gives plain scroll to the canvas only during intentional exploration', () => {
    expect(shouldDollyFromWheel(true)).toBe(true);
  });

  it('maps the single camera-framing control monotonically across its fitted range', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 200);
    rig.setView('spatial', computeInstrumentBounds(0.55, 16), camera, camera.aspect);

    expect(rig.setFraming(-1)).toBe(0);
    expect(rig.getFraming()).toBe(0);
    expect(rig.setFraming(0.5)).toBeCloseTo(0.5, 10);
    expect(rig.getFraming()).toBeCloseTo(0.5, 10);
    expect(rig.setFraming(2)).toBe(1);
    expect(rig.getFraming()).toBe(1);
  });

  it('keeps the named axial views mathematically literal', () => {
    const overhead = cameraPresetOrientation('overhead');
    const side = cameraPresetOrientation('side');

    expect(overhead.pitch).toBe(Math.PI / 2);
    expect(side.yaw).toBe(Math.PI / 2);
    expect(side.pitch).toBe(0);
  });

  it('places the literal overhead and side cameras on their named axes', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    const bounds = {
      min: { x: -2, y: -1, z: -3 },
      max: { x: 2, y: 1, z: 3 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 4, y: 2, z: 6 },
      radius: 4,
    };

    rig.setView('overhead', bounds, camera, camera.aspect);
    rig.update(camera, 0.1);
    expect(camera.position.x).toBeCloseTo(0, 10);
    expect(camera.position.z).toBeCloseTo(0, 10);
    expect(camera.position.y).toBeGreaterThan(0);

    rig.setView('side', bounds, camera, camera.aspect);
    rig.update(camera, 0.1);
    expect(camera.position.y).toBeCloseTo(0, 10);
    expect(camera.position.z).toBeCloseTo(0, 10);
    expect(camera.position.x).toBeGreaterThan(0);
  });

  it('keeps the spatial and centered constants deterministic and distinct', () => {
    expect(cameraPresetOrientation('spatial')).toEqual({
      yaw: 0.7501660156250033,
      pitch: 0.060423828124999954,
    });
    expect(cameraPresetOrientation('centered')).toEqual({ yaw: 0.02, pitch: 0.06 });
    expect(cameraPresetOrientation('spatial')).not.toEqual(cameraPresetOrientation('centered'));
  });

  it('restores the captured Spatial composition as a complete camera snapshot', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1920 / 963, 0.05, 200);
    rig.setView('spatial', computeInstrumentBounds(0.69, 18, 'separated'), camera, camera.aspect);
    rig.setSnapshot(AUTHORED_SPATIAL_CAMERA, camera);
    rig.update(camera, 0);

    const { yaw, pitch, distance, target, fov } = AUTHORED_SPATIAL_CAMERA;
    const cosPitch = Math.cos(pitch);
    expect(camera.fov).toBe(fov);
    expect(camera.position.x).toBeCloseTo(target.x + distance * Math.sin(yaw) * cosPitch, 12);
    expect(camera.position.y).toBeCloseTo(target.y + distance * Math.sin(pitch), 12);
    expect(camera.position.z).toBeCloseTo(target.z + distance * Math.cos(yaw) * cosPitch, 12);
  });

  it('keeps both authored planes legible in the Spatial projection', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 200);
    rig.setView('spatial', computeInstrumentBounds(0.55, 16), camera, camera.aspect);
    rig.update(camera, 0.1);
    camera.updateMatrixWorld();

    const origin = new THREE.Vector3().project(camera);
    const projected = (point: THREE.Vector3) => point.project(camera).sub(origin);
    const x = projected(new THREE.Vector3(1, 0, 0));
    const y = projected(new THREE.Vector3(0, 1, 0));
    const z = projected(new THREE.Vector3(0, 0, 1));
    const projectedArea = (first: THREE.Vector3, second: THREE.Vector3) => {
      const area = Math.abs(first.x * second.y - first.y * second.x);
      const scale = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
      return area / Math.max(scale, 1e-9);
    };

    expect(projectedArea(x, z)).toBeGreaterThan(0.2);
    expect(projectedArea(x, y)).toBeGreaterThan(0.2);
  });

  it.each([
    [0, 16 / 9],
    [0.55, 16 / 9],
    [MAX_ECCENTRICITY, 16 / 9],
    [0, 3 / 4],
    [0.55, 3 / 4],
    [MAX_ECCENTRICITY, 3 / 4],
  ])('fits every fixed view in both layouts at e = %s and aspect %s', (eccentricity, aspect) => {
    for (const layout of ['merged', 'separated'] as const) {
      const bounds = computeInstrumentBounds(eccentricity, 16, layout);
      for (const view of ['spatial', 'centered', 'overhead', 'side'] as const) {
        const rig = new CameraRig();
        const camera = new THREE.PerspectiveCamera(42, aspect, 0.05, 200);
        rig.setView(
          view,
          bounds,
          camera,
          camera.aspect,
          layout === 'merged' ? undefined : bounds.center,
        );
        rig.update(camera, 0.1);
        camera.updateMatrixWorld();

        for (const x of [bounds.min.x, bounds.max.x]) {
          for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
              const point = new THREE.Vector3(x, y, z).project(camera);
              expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
              expect(Math.abs(point.y)).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('makes a fixed selection independent of dirty camera and follow state', () => {
    const bounds = {
      min: { x: -4, y: -2, z: -3 },
      max: { x: 7, y: 3, z: 5 },
      center: { x: 1.5, y: 0.5, z: 1 },
      size: { x: 11, y: 5, z: 8 },
      radius: 7.3,
    };
    const cleanRig = new CameraRig();
    const dirtyRig = new CameraRig();
    const cleanCamera = new THREE.PerspectiveCamera(42, 1.6, 0.05, 200);
    const dirtyCamera = new THREE.PerspectiveCamera(42, 1.6, 0.05, 200);

    dirtyRig.beginFollow(new THREE.Vector3(9, -4, 12), 3.2, { yaw: 1.2, pitch: -0.4 });
    dirtyRig.update(dirtyCamera, 0.1);
    dirtyRig.orbit(140, -80);
    dirtyRig.pan(75, -35, dirtyCamera);
    dirtyRig.dolly(850);
    dirtyRig.update(dirtyCamera, 0.1);

    cleanRig.setView('spatial', bounds, cleanCamera, cleanCamera.aspect);
    dirtyRig.setView('spatial', bounds, dirtyCamera, dirtyCamera.aspect);
    cleanRig.update(cleanCamera, 0.1);
    dirtyRig.update(dirtyCamera, 0.1);

    expect(dirtyCamera.position.toArray()).toEqual(cleanCamera.position.toArray());
    expect(dirtyCamera.quaternion.toArray()).toEqual(cleanCamera.quaternion.toArray());
    expect(dirtyCamera.up.toArray()).toEqual(cleanCamera.up.toArray());
    expect(dirtyCamera.fov).toBe(cleanCamera.fov);

    // Selecting a fixed view released follow, so later tracking is inert.
    dirtyRig.trackFollow(new THREE.Vector3(100, 100, 100));
    dirtyRig.update(dirtyCamera, 0.1);
    expect(dirtyCamera.position.toArray()).toEqual(cleanCamera.position.toArray());
  });

  it('targets the world origin and fits projected AABB corners relative to it', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1.35, 0.05, 200);
    const bounds = {
      min: { x: -5, y: -2, z: -4 },
      max: { x: 8, y: 4, z: 7 },
      // A deliberately irrelevant centre guards against centre-relative fit.
      center: { x: 19, y: -11, z: 23 },
      size: { x: 13, y: 6, z: 11 },
      radius: 9,
    };

    rig.setView('centered', bounds, camera, camera.aspect);
    rig.update(camera, 0.1);
    camera.updateMatrixWorld();

    const projectedOrigin = new THREE.Vector3().project(camera);
    expect(projectedOrigin.x).toBeCloseTo(0, 10);
    expect(projectedOrigin.y).toBeCloseTo(0, 10);

    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('can fit the separated construction around its authored bounds centre', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1.35, 0.05, 200);
    const bounds = {
      min: { x: -7, y: -1, z: -2 },
      max: { x: 4, y: 4, z: 4 },
      center: { x: -1.5, y: 1.5, z: 1 },
      size: { x: 11, y: 5, z: 6 },
      radius: 7,
    };

    rig.setView('spatial', bounds, camera, camera.aspect, bounds.center);
    rig.update(camera, 0.1);
    camera.updateMatrixWorld();

    const projectedCenter = new THREE.Vector3(
      bounds.center.x,
      bounds.center.y,
      bounds.center.z,
    ).project(camera);
    expect(projectedCenter.x).toBeCloseTo(0, 10);
    expect(projectedCenter.y).toBeCloseTo(0, 10);

    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('releases tracking without changing the current orientation', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);

    rig.beginPointOfView(new THREE.Vector3(), new THREE.Vector3(3, 0, 0));
    rig.orbit(85, -30);
    for (let index = 0; index < 10; index += 1) rig.update(camera, 0.1);
    const trackedDirection = camera.getWorldDirection(new THREE.Vector3());

    rig.releaseFollow();
    rig.update(camera, 0.1);
    const freeDirection = camera.getWorldDirection(new THREE.Vector3());

    expect(freeDirection.dot(trackedDirection)).toBeGreaterThan(0.9999999);
  });

  it('uses the Sun camera as an anchored point of view with lens zoom', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    const sun = new THREE.Vector3(0, 0, 0);
    const planet = new THREE.Vector3(3, 0, 0);

    rig.beginPointOfView(sun, planet);
    rig.update(camera, 0.1);
    const direction = camera.getWorldDirection(new THREE.Vector3());
    expect(camera.position.x).toBeCloseTo(0.285, 8);
    expect(camera.position.y).toBeCloseTo(0, 8);
    expect(direction.x).toBeCloseTo(1, 8);
    expect(camera.fov).toBeCloseTo(70, 8);

    rig.dolly(-2_000);
    for (let index = 0; index < 12; index += 1) rig.update(camera, 0.1);
    expect(camera.fov).toBeLessThan(70);
    expect(camera.fov).toBeGreaterThanOrEqual(55);

    rig.dolly(4_000);
    for (let index = 0; index < 12; index += 1) rig.update(camera, 0.1);
    expect(camera.fov).toBeGreaterThan(100);
    expect(camera.fov).toBeLessThanOrEqual(105);
  });

  it('keeps the moving planet centred until the visitor deliberately looks away', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    const sun = new THREE.Vector3(0, 0, 0);

    rig.beginPointOfView(sun, new THREE.Vector3(3, 0, 0));
    rig.trackPointOfView(sun, new THREE.Vector3(0, 0, 3));
    rig.update(camera, 0.1);
    expect(camera.getWorldDirection(new THREE.Vector3()).z).toBeCloseTo(1, 8);

    rig.orbit(100, 0);
    for (let index = 0; index < 14; index += 1) rig.update(camera, 0.1);
    const visitorDirection = camera.getWorldDirection(new THREE.Vector3()).clone();
    rig.trackPointOfView(sun, new THREE.Vector3(-3, 0, 0));
    rig.update(camera, 0.1);
    expect(camera.getWorldDirection(new THREE.Vector3()).dot(visitorDirection)).toBeGreaterThan(0.99);
  });

  it('turns the Sun point of view in the same horizontal direction as the drag', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    rig.beginPointOfView(new THREE.Vector3(), new THREE.Vector3(3, 0, 0));
    rig.update(camera, 0.1);

    rig.orbit(120, 0);
    for (let index = 0; index < 14; index += 1) rig.update(camera, 0.1);

    // The initial view looks along +X, whose screen-right direction is +Z.
    // A rightward drag must therefore turn the point-of-view toward +Z.
    expect(camera.getWorldDirection(new THREE.Vector3()).z).toBeGreaterThan(0.4);
  });

  it('keeps Sun POV vertical drag consistent with the orbit camera', () => {
    const rig = new CameraRig();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    rig.beginPointOfView(new THREE.Vector3(), new THREE.Vector3(3, 0, 0));
    rig.update(camera, 0.1);

    rig.orbit(0, -100);
    for (let index = 0; index < 14; index += 1) rig.update(camera, 0.1);

    // Pulling upward tilts down, matching the instrument's orbit controls.
    expect(camera.getWorldDirection(new THREE.Vector3()).y).toBeLessThan(-0.3);
  });
});

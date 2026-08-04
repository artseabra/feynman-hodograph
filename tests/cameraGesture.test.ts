import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, cameraPresetOrientation, shouldDollyFromWheel } from '../src/scene/cameraRig';

describe('camera wheel ownership', () => {
  it('leaves ordinary entry scrolling to the document', () => {
    expect(shouldDollyFromWheel(false)).toBe(false);
  });

  it('gives plain scroll to the canvas only during intentional exploration', () => {
    expect(shouldDollyFromWheel(true)).toBe(true);
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

    rig.setView('overhead');
    rig.update(camera, 0.1);
    expect(camera.position.x).toBeCloseTo(0, 10);
    expect(camera.position.z).toBeCloseTo(0, 10);
    expect(camera.position.y).toBeGreaterThan(0);

    rig.setView('side');
    rig.update(camera, 0.1);
    expect(camera.position.y).toBeCloseTo(0, 10);
    expect(camera.position.z).toBeCloseTo(0, 10);
    expect(camera.position.x).toBeGreaterThan(0);
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
    expect(camera.fov).toBeCloseTo(108, 8);

    rig.dolly(-2_000);
    for (let index = 0; index < 12; index += 1) rig.update(camera, 0.1);
    expect(camera.fov).toBeLessThan(108);
    expect(camera.fov).toBeGreaterThanOrEqual(52);
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, cameraPresetOrientation, shouldDollyFromWheel } from '../src/scene/cameraRig';

describe('camera wheel ownership', () => {
  it('leaves ordinary entry scrolling to the document', () => {
    expect(shouldDollyFromWheel({ altKey: false, ctrlKey: false })).toBe(false);
  });

  it('requires an explicit modifier for canvas dolly', () => {
    expect(shouldDollyFromWheel({ altKey: true, ctrlKey: false })).toBe(true);
    expect(shouldDollyFromWheel({ altKey: false, ctrlKey: true })).toBe(true);
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
});

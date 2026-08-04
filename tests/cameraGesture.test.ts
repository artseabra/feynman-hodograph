import { describe, expect, it } from 'vitest';
import { shouldDollyFromWheel } from '../src/scene/cameraRig';

describe('camera wheel ownership', () => {
  it('leaves ordinary entry scrolling to the document', () => {
    expect(shouldDollyFromWheel({ altKey: false, ctrlKey: false })).toBe(false);
  });

  it('requires an explicit modifier for canvas dolly', () => {
    expect(shouldDollyFromWheel({ altKey: true, ctrlKey: false })).toBe(true);
    expect(shouldDollyFromWheel({ altKey: false, ctrlKey: true })).toBe(true);
  });
});

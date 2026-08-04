import { describe, expect, it } from 'vitest';
import { initialCameraState, reduceCameraState } from '../src/ui/cameraState';

describe('camera state transitions', () => {
  it('starts in the centered fixed view', () => {
    expect(initialCameraState()).toEqual({ cameraView: 'centered', cameraFocus: 'free' });
  });

  it('selects a preset atomically with free focus', () => {
    const state = reduceCameraState(
      { cameraView: 'custom', cameraFocus: 'planet' },
      { type: 'preset', view: 'overhead' },
    );

    expect(state).toEqual({ cameraView: 'overhead', cameraFocus: 'free' });
  });

  it('marks manual movement custom without dropping a body focus', () => {
    const state = reduceCameraState(
      { cameraView: 'spatial', cameraFocus: 'sun' },
      { type: 'manual' },
    );

    expect(state).toEqual({ cameraView: 'custom', cameraFocus: 'sun' });
  });

  it('clears the fixed view for body focus and Free alike', () => {
    const focused = reduceCameraState(
      { cameraView: 'centered', cameraFocus: 'free' },
      { type: 'focus', focus: 'hodograph' },
    );
    const released = reduceCameraState(focused, { type: 'focus', focus: 'free' });

    expect(focused).toEqual({ cameraView: 'custom', cameraFocus: 'hodograph' });
    expect(released).toEqual({ cameraView: 'custom', cameraFocus: 'free' });
  });

  it('keeps an already-active travel mode idempotent', () => {
    const fixed = { cameraView: 'centered', cameraFocus: 'free' } as const;
    const following = { cameraView: 'custom', cameraFocus: 'planet' } as const;

    expect(reduceCameraState(fixed, { type: 'focus', focus: 'free' })).toBe(fixed);
    expect(reduceCameraState(following, { type: 'focus', focus: 'planet' })).toBe(following);
  });
});

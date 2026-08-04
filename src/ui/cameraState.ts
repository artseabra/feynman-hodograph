import type { CameraFocus, CameraView, InstrumentState } from '../types';

export type CameraState = Pick<InstrumentState, 'cameraView' | 'cameraFocus'>;

export type CameraStateAction =
  | { type: 'preset'; view: CameraView }
  | { type: 'manual' }
  | { type: 'focus'; focus: CameraFocus };

export function initialCameraState(): CameraState {
  return {
    cameraView: 'centered',
    cameraFocus: 'free',
  };
}

/**
 * Camera UI state has one authority boundary: only selecting a fixed preset
 * may name a fixed view. Hand movement and every focus-mode transition leave
 * the current composition in place and therefore make it custom.
 */
export function reduceCameraState(state: CameraState, action: CameraStateAction): CameraState {
  switch (action.type) {
    case 'preset':
      return { cameraView: action.view, cameraFocus: 'free' };
    case 'manual':
      return { ...state, cameraView: 'custom' };
    case 'focus':
      if (state.cameraFocus === action.focus) return state;
      return { cameraView: 'custom', cameraFocus: action.focus };
  }
}

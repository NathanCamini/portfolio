/**
 * Pointer → rotation *intent*, shared by the drag hook (writer) and the rig
 * controller (reader). Kept free of React/R3F imports so it's testable in Node.
 */
export interface RotationState {
  yaw: number; // target rotation around Y (rad)
  pitch: number; // target rotation around X (rad), clamped
  velocity: number; // yaw inertia after release (rad / 60 fps frame)
  dragging: boolean;
}

/** Resting pose from the design: a slight three-quarter front view. */
export const REST_YAW = -0.32;
export const REST_PITCH = 0.05;
export const PITCH_MIN = -0.2;
export const PITCH_MAX = 0.55;

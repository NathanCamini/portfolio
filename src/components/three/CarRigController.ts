import { Group, MathUtils, type PerspectiveCamera } from 'three';
import { createPorsche911, type PaintFinish, type Porsche911 } from './porsche911';
import type { RotationState } from './rotation';

// Frame-rate independent smoothing rates (λ for MathUtils.damp), derived from
// the design's per-frame lerps at 60 fps: λ = −ln(1 − k) · 60.
const FOLLOW = 5.66; // track follows scroll (k = 0.09)
const TURN = 9.75; // spin follows pointer (k = 0.15)
const INERTIA = 0.93; // yaw velocity decay per 60 fps frame
const SPIN_PIVOT_Y = 0.65; // visual centre of the car

// Camera framing from the design: fov 30°, at (0, 2.6, 13) looking at (0, 0.9, 0).
const CAM_DISTANCE = 13;
const CAM_HEIGHT = 2.6;
const LOOK_AT_Y = 0.9;
/** Half the visible width (m) we need at z = 0: half a car (2.3 m) + room to drive. */
const MIN_HALF_WIDTH = 3.9;

export interface RigFrame {
  /** Seconds since last frame. */
  delta: number;
  /** Scroll progress through the car section, 0 → 1. */
  progress: number;
  camera: PerspectiveCamera;
  rotation: RotationState;
  readout?: HTMLElement | null;
}

/**
 * THE KEY IDEA — two nested groups, one writer each:
 *
 *   scene
 *    └ track   ← ONLY scroll writes here      (position.x)
 *       └ spin ← ONLY the pointer writes here (rotation.x / rotation.y)
 *          └ 911 (chassis squats, wheels roll, DRS opens — all derived from track motion)
 *
 * Transforms compose parent → child, so rotating `spin` can never move the car
 * off its scroll trajectory, and scrolling can never reset the user's rotation.
 * No shared variable, no "who wins" logic, no conflicts.
 *
 * Plain TypeScript (no React): R3F calls `update()` from useFrame, and the
 * whole thing can be unit-tested with a fake camera.
 */
export class CarRigController {
  readonly track = new Group();
  readonly spin = new Group();
  readonly car: Porsche911;

  private velocity = 0;
  private pitch = 0;
  private wing = 0;
  private lastText = '';
  private framedAspect = 0;

  constructor(paintColor: string, finish: PaintFinish = 'metallic') {
    this.car = createPorsche911(paintColor, finish);
    this.track.name = 'track';
    this.spin.name = 'spin';
    // Pivot the spin group at the car's visual centre so dragging turns it in place.
    this.spin.position.y = SPIN_PIVOT_Y;
    this.car.root.position.y = -SPIN_PIVOT_Y;
    this.spin.add(this.car.root);
    this.track.add(this.spin);
  }

  /**
   * Advances one frame. Returns `true` while anything is still settling, so the
   * caller can keep requesting frames (R3F `frameloop="demand"`) and render
   * nothing at all once the car is at rest.
   */
  update({ delta: rawDelta, progress, camera, rotation, readout }: RigFrame): boolean {
    // Clamp: after a tab switch rAF resumes with a huge delta.
    const delta = Math.min(Math.max(rawDelta, 1e-4), 0.1);
    const { track, spin, car } = this;
    this.frame(camera);

    // 1) SCROLL → target X. Travel is sized from the visible frustum width at
    //    z = 0, so the car enters/leaves at the screen edges on any aspect ratio.
    const halfW = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
    const X = Math.max(0.4, halfW - 2.6);
    const targetX = -X + 2 * X * progress;

    // 2) Damped follow (critically-damped "spring") smooths wheel/trackpad jitter.
    const prevX = track.position.x;
    track.position.x = MathUtils.damp(prevX, targetX, FOLLOW, delta);
    const dx = track.position.x - prevX;

    // 3) Everything the car does is DERIVED from how far `track` actually moved:
    //    wheels roll without slipping (angle = distance / radius; front and rear radii differ)…
    for (const w of car.wheels) w.spin.rotation.z -= dx / w.radius;
    //    …the body squats under acceleration and dives under braking…
    const v = dx / delta;
    const accel = (v - this.velocity) / delta;
    this.velocity = v;
    this.pitch = MathUtils.damp(this.pitch, MathUtils.clamp(accel * 0.0016, -0.035, 0.035), 6, delta);
    car.chassis.rotation.z = this.pitch;
    //    …and the rear wing's DRS flap opens above "speed", like on track.
    const wingTarget = Math.abs(v) > 1.2 ? 1 : 0;
    this.wing = MathUtils.damp(this.wing, wingTarget, 3, delta);
    car.setDrs(this.wing);

    // 4) USER rotation, applied to the child group only (with release inertia).
    if (!rotation.dragging && Math.abs(rotation.velocity) > 1e-5) {
      rotation.yaw += rotation.velocity * delta * 60;
      rotation.velocity *= Math.pow(INERTIA, delta * 60);
    }
    spin.rotation.y = MathUtils.damp(spin.rotation.y, rotation.yaw, TURN, delta);
    spin.rotation.x = MathUtils.damp(spin.rotation.x, rotation.pitch, TURN, delta);

    // 5) Telemetry readout — plain DOM write, only when the text changes.
    if (readout) {
      const deg = Math.round(MathUtils.radToDeg(spin.rotation.y));
      const text = `scroll ${(progress * 100).toFixed(0)}% → track.x ${track.position.x.toFixed(2)}m · spin.y ${deg}°`;
      if (text !== this.lastText) readout.textContent = this.lastText = text;
    }

    return (
      Math.abs(targetX - track.position.x) > 1e-4 ||
      Math.abs(this.pitch) > 1e-4 ||
      Math.abs(this.wing - wingTarget) > 1e-3 ||
      Math.abs(rotation.velocity) > 1e-5 ||
      Math.abs(rotation.yaw - spin.rotation.y) > 1e-4 ||
      Math.abs(rotation.pitch - spin.rotation.x) > 1e-4
    );
  }

  /**
   * Responsive framing: on narrow (portrait) screens the design's camera would
   * crop the 4.5 m car, so dolly back along the same line of sight until the
   * frustum is at least MIN_HALF_WIDTH wide at the car. Runs only on aspect change.
   */
  private frame(camera: PerspectiveCamera) {
    if (camera.aspect === this.framedAspect) return;
    this.framedAspect = camera.aspect;
    const tan = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(CAM_DISTANCE, MIN_HALF_WIDTH / (tan * camera.aspect));
    const k = distance / CAM_DISTANCE;
    camera.position.set(0, LOOK_AT_Y + (CAM_HEIGHT - LOOK_AT_Y) * k, distance);
    camera.lookAt(0, LOOK_AT_Y, 0);
  }

  setPaint(hex: string, finish?: PaintFinish) {
    this.car.setPaint(hex, finish);
  }

  dispose() {
    this.car.dispose();
  }
}

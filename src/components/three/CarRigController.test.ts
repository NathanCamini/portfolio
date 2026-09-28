import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { CarRigController } from './CarRigController';
import { REST_PITCH, REST_YAW, type RotationState } from './rotation';

const FRAME = 1 / 60;

function setup() {
  const rig = new CarRigController('#9ea4b0');
  const camera = new PerspectiveCamera(30, 16 / 9, 0.1, 100);
  const rotation: RotationState = { yaw: REST_YAW, pitch: REST_PITCH, velocity: 0, dragging: false };
  const run = (progress: number, frames = 240) => {
    for (let i = 0; i < frames; i++) rig.update({ delta: FRAME, progress, camera, rotation });
  };
  return { rig, camera, rotation, run };
}

describe('CarRigController — scroll and pointer never interfere', () => {
  it('scroll moves only the track group, never the spin rotation', () => {
    const { rig, run } = setup();
    run(0);
    const spinBefore = rig.spin.rotation.clone();
    run(1);
    expect(rig.track.position.x).toBeGreaterThan(0);
    expect(rig.spin.rotation.y).toBeCloseTo(spinBefore.y, 5);
    expect(rig.spin.rotation.x).toBeCloseTo(spinBefore.x, 5);
  });

  it('rotating never changes the trajectory (track.x)', () => {
    const { rig, rotation, run } = setup();
    run(0.5);
    const x = rig.track.position.x;
    rotation.yaw += Math.PI; // user spins the car half a turn
    rotation.pitch = 0.4;
    run(0.5);
    expect(rig.track.position.x).toBeCloseTo(x, 6);
    expect(rig.spin.rotation.y).toBeCloseTo(REST_YAW + Math.PI, 3);
  });

  it('the world position of the car depends only on scroll, whatever the rotation', () => {
    const a = setup();
    const b = setup();
    b.rotation.yaw = 2.1;
    b.rotation.pitch = -0.2;
    for (const p of [0, 0.3, 0.8, 1]) {
      a.run(p);
      b.run(p);
      expect(b.rig.track.position.x).toBeCloseTo(a.rig.track.position.x, 6);
    }
  });

  it('wheels roll by distance / radius', () => {
    const { rig, run } = setup();
    run(0);
    const before = rig.car.wheels.map((w) => w.spin.rotation.z);
    const x0 = rig.track.position.x;
    run(1, 600);
    const travelled = rig.track.position.x - x0;
    rig.car.wheels.forEach((w, i) => {
      expect(before[i] - w.spin.rotation.z).toBeCloseTo(travelled / w.radius, 3);
    });
  });

  it('reports "settling" while moving and goes idle once at rest (on-demand rendering)', () => {
    const { rig, camera, rotation, run } = setup();
    run(0, 600);
    expect(rig.update({ delta: FRAME, progress: 0, camera, rotation })).toBe(false);
    expect(rig.update({ delta: FRAME, progress: 1, camera, rotation })).toBe(true);
  });

  it('dollies the camera back on portrait screens so the car fits', () => {
    const { rig, camera, rotation } = setup();
    camera.aspect = 390 / 844;
    rig.update({ delta: FRAME, progress: 0, camera, rotation });
    const halfWidth = Math.tan((camera.fov / 2) * (Math.PI / 180)) * camera.position.z * camera.aspect;
    expect(halfWidth).toBeGreaterThanOrEqual(3.9 - 1e-6);
  });
});

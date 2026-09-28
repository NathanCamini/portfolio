import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
} from 'three';
import type { CarMaterials } from './materials';

export interface WheelSpec {
  radius: number;
  width: number;
  rimRadius: number;
}

/**
 * One wheel assembly:
 *
 *   mount   ← positioned at the axle, never rotates (holds the brake caliper)
 *    └ spin ← rotation.z is driven by distance travelled / radius
 *        ├ tyre (lathe profile with rounded shoulders)
 *        ├ rim barrel, lip, 5 twin spokes, hub
 *        └ brake disc
 *
 * Geometries are cached per spec so the 4 wheels share buffers.
 */
export function createWheel(spec: WheelSpec, mats: CarMaterials, cache: Map<string, BufferGeometry>) {
  const key = (name: string) => `${name}:${spec.radius}:${spec.width}`;
  const geo = <T extends BufferGeometry>(name: string, make: () => T): T => {
    const k = key(name);
    if (!cache.has(k)) cache.set(k, make());
    return cache.get(k) as T;
  };

  const { radius: R, width: w, rimRadius: rr } = spec;
  const mount = new Group();
  const spin = new Group();
  mount.add(spin);

  // Tyre: revolve a rounded-rectangle cross-section around the axle.
  const tyre = new Mesh(
    geo('tyre', () => {
      const h = w / 2;
      const profile = [
        new Vector2(rr, -h),
        new Vector2(R - 0.035, -h),
        new Vector2(R - 0.01, -h + 0.018),
        new Vector2(R, -h + 0.05),
        new Vector2(R, h - 0.05),
        new Vector2(R - 0.01, h - 0.018),
        new Vector2(R - 0.035, h),
        new Vector2(rr, h),
      ];
      return new LatheGeometry(profile, 56).rotateX(Math.PI / 2);
    }),
    mats.rubber,
  );
  spin.add(tyre);

  // Rim barrel (dark, seen through the spokes) and polished outer lip.
  spin.add(
    new Mesh(
      geo('barrel', () => new CylinderGeometry(rr - 0.004, rr - 0.004, w * 0.86, 40, 1, true).rotateX(Math.PI / 2)),
      mats.alloyDark,
    ),
  );
  const lip = new Mesh(
    geo('lip', () => new TorusGeometry(rr - 0.006, 0.011, 8, 56)),
    mats.alloy,
  );
  lip.position.z = w / 2 - 0.012;
  spin.add(lip);

  // Five twin spokes, slightly recessed from the lip.
  const spokeGeo = geo('spoke', () => new BoxGeometry(rr - 0.07, 0.03, 0.028));
  const faceZ = w / 2 - 0.035;
  for (let i = 0; i < 5; i++) {
    for (const offset of [-0.13, 0.13]) {
      const a = (i / 5) * Math.PI * 2 + offset;
      const spoke = new Mesh(spokeGeo, mats.alloy);
      const mid = 0.06 + (rr - 0.07) / 2;
      spoke.position.set(Math.cos(a) * mid, Math.sin(a) * mid, faceZ);
      spoke.rotation.z = a;
      spin.add(spoke);
    }
  }

  const hub = new Mesh(
    geo('hub', () => new CylinderGeometry(0.07, 0.075, 0.05, 28).rotateX(Math.PI / 2)),
    mats.alloy,
  );
  hub.position.z = faceZ;
  spin.add(hub);
  const cap = new Mesh(
    geo('cap', () => new CylinderGeometry(0.036, 0.036, 0.056, 24).rotateX(Math.PI / 2)),
    mats.trim,
  );
  cap.position.z = faceZ + 0.004;
  spin.add(cap);

  // Brake disc spins with the wheel…
  const disc = new Mesh(
    geo('disc', () => new CylinderGeometry(rr * 0.76, rr * 0.76, 0.028, 40).rotateX(Math.PI / 2)),
    mats.brakeDisc,
  );
  disc.position.z = -0.01;
  spin.add(disc);

  // …the caliper does not (it lives on the mount), just like the real thing.
  const caliper = new Mesh(
    geo('caliper', () => new BoxGeometry(0.17, 0.075, 0.07)),
    mats.caliper,
  );
  const ca = Math.PI * 0.62; // upper-rear of the disc
  caliper.position.set(Math.cos(ca) * rr * 0.68, Math.sin(ca) * rr * 0.68, 0.02);
  caliper.rotation.z = ca - Math.PI / 2;
  mount.add(caliper);

  return { mount, spin };
}

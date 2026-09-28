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
 *        ├ forged rim: barrel, polished lip, 10 spokes, centre-lock nut
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
    mats.chrome,
  );
  lip.position.z = w / 2 - 0.012;
  spin.add(lip);

  // Ten straight forged spokes, slightly recessed from the lip.
  const spokeGeo = geo('spoke', () => new BoxGeometry(rr - 0.075, 0.026, 0.03));
  const faceZ = w / 2 - 0.035;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spoke = new Mesh(spokeGeo, mats.alloy);
    const mid = 0.065 + (rr - 0.075) / 2;
    spoke.position.set(Math.cos(a) * mid, Math.sin(a) * mid, faceZ);
    spoke.rotation.z = a;
    spin.add(spoke);
  }

  const hub = new Mesh(
    geo('hub', () => new CylinderGeometry(0.075, 0.08, 0.05, 30).rotateX(Math.PI / 2)),
    mats.alloy,
  );
  hub.position.z = faceZ;
  spin.add(hub);
  // Centre-lock nut (a single hexagonal nut instead of five bolts, as on the RS).
  const nut = new Mesh(
    geo('nut', () => new CylinderGeometry(0.045, 0.045, 0.07, 6).rotateX(Math.PI / 2)),
    mats.nut,
  );
  nut.position.z = faceZ + 0.01;
  spin.add(nut);

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

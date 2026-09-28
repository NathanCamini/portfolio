import { Group, Mesh, type BufferGeometry } from 'three';
export type { PaintFinish } from './materials';
import { createBodyGeometry } from './body';
import { createDetails } from './details';
import { DIM } from './dimensions';
import { applyPaint, createMaterials, type PaintFinish } from './materials';
import { createWheel } from './wheel';

export interface Porsche911 {
  /** Add this to the scene. Origin = ground level, centre of the car. */
  root: Group;
  /** Everything sprung (body, lamps, mirrors): pitch this for squat/dive. Pivot ≈ axle height. */
  chassis: Group;
  /** Wheel spin groups with their rolling radius (front and rear differ). */
  wheels: { spin: Group; radius: number }[];
  /** Deployable rear wing and its retracted height. */
  spoiler: Group;
  spoilerRestY: number;
  spoilerRestTilt: number;
  setPaint: (hex: string, finish?: PaintFinish) => void;
  dispose: () => void;
}

/**
 * Procedural Porsche 911 (992) — no external model file, ~20k triangles.
 * Pure Three.js (framework-agnostic): React only mounts `root`.
 *
 * To use a GLB instead, return the same `Porsche911` shape from a loader:
 * the rig in CarRig only relies on `chassis`, `wheels`, `spoiler`.
 */
export function createPorsche911(paintColor: string, finish: PaintFinish = 'metallic'): Porsche911 {
  const mats = createMaterials(paintColor, finish);
  const root = new Group();
  root.name = 'porsche-911';

  // Chassis pivot near axle height so pitching rotates the body over the wheels.
  const PIVOT_Y = 0.45;
  const chassis = new Group();
  chassis.position.y = PIVOT_Y;
  const sprung = new Group();
  sprung.position.y = -PIVOT_Y;
  chassis.add(sprung);
  root.add(chassis);

  const bodyGeometry = createBodyGeometry();
  // Material order matches BODY_GROUP in body.ts: paint, glass, trim, underbody.
  const body = new Mesh(bodyGeometry, [mats.paint, mats.glass, mats.trim, mats.underbody]);
  body.name = 'body';
  sprung.add(body);

  const details = createDetails(body, mats);
  sprung.add(details.group);

  const wheelCache = new Map<string, BufferGeometry>();
  const wheels: Porsche911['wheels'] = [];
  for (const axle of [DIM.front, DIM.rear]) {
    for (const side of [1, -1]) {
      const { mount, spin } = createWheel(
        { radius: axle.radius, width: axle.width, rimRadius: DIM.rimRadius },
        mats,
        wheelCache,
      );
      mount.position.set(axle.x, axle.radius, axle.z * side);
      // Mirror (not rotate) the left-hand wheels: spokes face outward and the
      // spin direction stays identical, so one rolling formula drives all four.
      if (side < 0) mount.scale.z = -1;
      root.add(mount);
      wheels.push({ spin, radius: axle.radius });
    }
  }

  return {
    root,
    chassis,
    wheels,
    spoiler: details.spoiler,
    spoilerRestY: details.spoilerRestY,
    spoilerRestTilt: details.spoilerRestTilt,
    setPaint: (hex, f = finish) => applyPaint(mats.paint, hex, f),
    dispose: () => {
      bodyGeometry.dispose();
      details.dispose();
      wheelCache.forEach((g) => g.dispose());
      mats.dispose();
    },
  };
}

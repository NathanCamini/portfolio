import {
  BoxGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Raycaster,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { roofLine } from './body';
import type { CarMaterials } from './materials';

/**
 * Parts that sit ON the body (lamps, mirrors, spoiler, tail pipes).
 * Instead of hard-coding where the curved surface is, we raycast against the
 * body mesh — so tweaking a character line in body.ts keeps every detail glued
 * to the paint.
 */
export function createDetails(body: Mesh, mats: CarMaterials) {
  const geometries: BufferGeometry[] = [];
  const track = <T extends BufferGeometry>(g: T) => (geometries.push(g), g);
  const group = new Group();
  const ray = new Raycaster();
  body.updateMatrixWorld(true);

  const hit = (origin: Vector3, dir: Vector3) => {
    ray.set(origin, dir.normalize());
    const [h] = ray.intersectObject(body, false);
    return h ? { point: h.point.clone(), normal: h.face!.normal.clone() } : null;
  };

  // ── Round headlights with the 4-point LED signature (992), set into the front
  //    of the fenders and raked back so they look forward *and* up. ──
  for (const side of [1, -1]) {
    const aim = new Vector3(1, 0.62, 0.22 * side).normalize();
    const target = new Vector3(1.96, 0.69, 0.62 * side);
    const h = hit(target.clone().addScaledVector(aim, 1.5), aim.clone().negate());
    if (!h) continue;
    // Blend the surface normal with the design direction: seated on the paint, but raked.
    const facing = h.normal.clone().lerp(aim, 0.5).normalize();
    const lamp = new Group();
    lamp.position.copy(h.point).addScaledVector(facing, 0.01);
    lamp.lookAt(lamp.position.clone().add(facing));

    const bezel = new Mesh(track(new TorusGeometry(0.128, 0.013, 10, 48)), mats.chrome);
    const lens = new Mesh(track(new CircleGeometry(0.128, 48)), mats.lens);
    lens.position.z = -0.004;
    lamp.add(bezel, lens);

    const dotGeo = track(new CircleGeometry(0.017, 16));
    for (const [dx, dy] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const dot = new Mesh(dotGeo, mats.drl);
      dot.position.set(dx * 0.052, dy * 0.052, 0.002);
      lamp.add(dot);
    }
    const projector = new Mesh(track(new TorusGeometry(0.03, 0.007, 8, 24)), mats.drl);
    projector.position.z = 0.002;
    lamp.add(projector);
    group.add(lamp);
  }

  // ── Full-width rear light bar, following the curvature of the tail ──
  const barPoints: Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const z = -0.78 + (1.56 * i) / 16;
    const h = hit(new Vector3(-3, 0.8, z), new Vector3(1, 0, 0));
    if (h) barPoints.push(h.point.addScaledVector(h.normal, 0.006));
  }
  if (barPoints.length > 3) {
    const bar = new Mesh(track(new TubeGeometry(new CatmullRomCurve3(barPoints), 64, 0.017, 8)), mats.taillight);
    group.add(bar);
    const trimBand = new Mesh(
      track(new TubeGeometry(new CatmullRomCurve3(barPoints.map((p) => p.clone().setY(0.845))), 64, 0.012, 6)),
      mats.trim,
    );
    group.add(trimBand);
  }

  // ── Door mirrors: slim, laterally elongated caps on short arms ──
  const headGeo = track(new SphereGeometry(1, 24, 16));
  const armGeo = track(new BoxGeometry(0.08, 0.03, 0.14));
  const mirrorGlassGeo = track(new CircleGeometry(1, 24));
  for (const side of [1, -1]) {
    const mirror = new Group();
    mirror.position.set(0.3, 0.955, 0.975 * side);
    const head = new Mesh(headGeo, mats.paint);
    head.scale.set(0.055, 0.05, 0.105);
    const glass = new Mesh(mirrorGlassGeo, mats.glass);
    glass.scale.set(0.085, 0.035, 1);
    glass.rotation.y = -Math.PI / 2;
    glass.position.x = -0.035;
    const arm = new Mesh(armGeo, mats.paint);
    arm.position.set(0.01, -0.03, -0.11 * side);
    mirror.add(head, glass, arm);
    group.add(mirror);
  }

  // ── Active rear spoiler: a thin blade bent to the engine-lid crown, flush when
  //    retracted; CarRigController raises it with speed like the real car's. ──
  const spoiler = new Group();
  const spoilerX = -2.12;
  const deckAt = (x: number, z = 0) => hit(new Vector3(x, 3, z), new Vector3(0, -1, 0))?.point.y ?? roofLine(x);
  const deckCentre = deckAt(spoilerX);
  const blade = new Shape();
  blade.moveTo(-0.09, 0);
  blade.quadraticCurveTo(-0.01, 0.022, 0.08, 0.008);
  blade.lineTo(0.08, -0.004);
  blade.lineTo(-0.09, -0.004);
  const bladeGeo = track(
    new ExtrudeGeometry(blade, { depth: 1.12, steps: 16, bevelEnabled: false }).translate(0, 0, -0.56),
  );
  // Bend the blade so its span follows the crown of the lid.
  const pos = bladeGeo.attributes.position;
  const drop = new Map<number, number>();
  for (let i = 0; i < pos.count; i++) {
    const z = Math.round(pos.getZ(i) * 1000) / 1000;
    if (!drop.has(z)) drop.set(z, deckAt(spoilerX, z) - deckCentre);
    pos.setY(i, pos.getY(i) + drop.get(z)!);
  }
  bladeGeo.computeVertexNormals();
  const strutGeo = track(new BoxGeometry(0.05, 0.09, 0.018));
  const struts = [-0.32, 0.32].map((z) => {
    const s = new Mesh(strutGeo, mats.trim);
    s.position.set(0, -0.045 + (deckAt(spoilerX, z) - deckCentre), z);
    return s;
  });
  spoiler.add(new Mesh(bladeGeo, mats.paint), ...struts);
  spoiler.position.set(spoilerX, deckCentre + 0.002, 0);
  // Match the lid's fore-aft slope so the retracted blade lies flush.
  const restTilt = Math.atan2(deckAt(spoilerX + 0.08) - deckAt(spoilerX - 0.08), 0.16);
  spoiler.rotation.z = restTilt;
  group.add(spoiler);

  // ── Twin oval tail pipes ──
  const pipeGeo = track(new CylinderGeometry(0.045, 0.045, 0.12, 24, 1, true).rotateZ(Math.PI / 2));
  const pipeInnerGeo = track(new CircleGeometry(0.04, 24).rotateY(-Math.PI / 2));
  for (const z of [-0.36, 0.36]) {
    const pipe = new Mesh(pipeGeo, mats.chrome);
    pipe.scale.set(1, 0.72, 1);
    pipe.position.set(-2.24, 0.34, z);
    const inner = new Mesh(pipeInnerGeo, mats.underbody);
    inner.scale.set(1, 0.72, 1);
    inner.position.set(-2.29, 0.34, z);
    group.add(pipe, inner);
  }

  return {
    group,
    spoiler,
    spoilerRestY: spoiler.position.y,
    spoilerRestTilt: restTilt,
    dispose: () => geometries.forEach((g) => g.dispose()),
  } satisfies {
    group: Object3D;
    spoiler: Object3D;
    spoilerRestY: number;
    spoilerRestTilt: number;
    dispose: () => void;
  };
}

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
 * Parts that sit ON the body (lamps, mirrors, swan-neck wing, splitter, tail pipes).
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

  const deckAt = (x: number, z = 0) => hit(new Vector3(x, 3, z), new Vector3(0, -1, 0))?.point.y ?? roofLine(x);

  // ── Swan-neck rear wing with DRS — the GT3 RS signature ──
  // Main plane: an inverted airfoil (flat top, cambered underside) spanning the car.
  const WING_X = -1.93;
  const WING_Y = 1.25;
  const SPAN = 1.64;
  const mainFoil = new Shape();
  mainFoil.moveTo(0.21, 0);
  mainFoil.quadraticCurveTo(0.08, 0.024, -0.21, 0.014);
  mainFoil.lineTo(-0.21, 0.004);
  mainFoil.quadraticCurveTo(0.02, -0.042, 0.21, 0);
  const mainGeo = track(new ExtrudeGeometry(mainFoil, { depth: SPAN, bevelEnabled: false }).translate(0, 0, -SPAN / 2));
  const wing = new Group();
  wing.position.set(WING_X, WING_Y, 0);
  const mainPlane = new Mesh(mainGeo, mats.carbon);
  mainPlane.rotation.z = -0.08; // slight angle of attack
  wing.add(mainPlane);

  // Upper flap: pivots at its leading edge. Steep at rest, flattened when DRS opens.
  const flapFoil = new Shape();
  flapFoil.moveTo(0, 0);
  flapFoil.quadraticCurveTo(-0.07, 0.018, -0.17, 0.008);
  flapFoil.lineTo(-0.17, 0.0);
  flapFoil.quadraticCurveTo(-0.08, -0.02, 0, 0);
  const flapGeo = track(
    new ExtrudeGeometry(flapFoil, { depth: SPAN - 0.04, bevelEnabled: false }).translate(0, 0, -(SPAN - 0.04) / 2),
  );
  const drs = new Group();
  drs.position.set(-0.16, 0.05, 0);
  const DRS_CLOSED = -0.42;
  drs.rotation.z = DRS_CLOSED;
  drs.add(new Mesh(flapGeo, mats.paint));
  wing.add(drs);

  // Endplates.
  const plate = new Shape();
  plate.moveTo(0.26, -0.07);
  plate.lineTo(0.24, 0.04);
  plate.quadraticCurveTo(0.0, 0.1, -0.3, 0.15);
  plate.lineTo(-0.32, -0.02);
  plate.quadraticCurveTo(-0.05, -0.1, 0.26, -0.07);
  const plateGeo = track(new ExtrudeGeometry(plate, { depth: 0.012, bevelEnabled: false }));
  for (const side of [1, -1]) {
    const p = new Mesh(plateGeo, mats.carbon);
    p.position.z = side > 0 ? SPAN / 2 : -SPAN / 2 - 0.012;
    wing.add(p);
  }

  // Swan necks: rise from the engine lid and hook over the wing to hold it from above.
  for (const z of [-0.34, 0.34]) {
    const baseY = deckAt(-1.84, z) - 0.01;
    const curve = new CatmullRomCurve3([
      new Vector3(-1.84, baseY, 0),
      new Vector3(-1.87, baseY + 0.16, 0),
      new Vector3(-1.9, WING_Y + 0.07, 0),
      new Vector3(-1.97, WING_Y + 0.1, 0),
      new Vector3(-2.03, WING_Y + 0.035, 0),
    ]);
    const neck = new Mesh(track(new TubeGeometry(curve, 40, 0.026, 10)), mats.carbon);
    neck.scale.z = 0.6; // flattened, blade-like section
    neck.position.z = z;
    group.add(neck);
  }
  group.add(wing);

  // ── Front splitter: a flat plate following the nose outline ──
  const splitter = new Shape();
  splitter.moveTo(1.9, -0.84);
  splitter.lineTo(2.14, -0.82);
  splitter.quadraticCurveTo(2.34, -0.5, 2.31, 0);
  splitter.quadraticCurveTo(2.34, 0.5, 2.14, 0.82);
  splitter.lineTo(1.9, 0.84);
  splitter.lineTo(1.9, -0.84);
  const splitterGeo = track(new ExtrudeGeometry(splitter, { depth: 0.018, bevelEnabled: false }).rotateX(Math.PI / 2));
  const splitterMesh = new Mesh(splitterGeo, mats.trim);
  splitterMesh.position.y = 0.118;
  group.add(splitterMesh);

  // ── Twin round centre tail pipes above the diffuser ──
  const pipeGeo = track(new CylinderGeometry(0.052, 0.052, 0.14, 28, 1, true).rotateZ(Math.PI / 2));
  const pipeInnerGeo = track(new CircleGeometry(0.047, 28).rotateY(-Math.PI / 2));
  for (const z of [-0.1, 0.1]) {
    const pipe = new Mesh(pipeGeo, mats.chrome);
    pipe.position.set(-2.27, 0.36, z);
    const inner = new Mesh(pipeInnerGeo, mats.underbody);
    inner.position.set(-2.33, 0.36, z);
    group.add(pipe, inner);
  }

  return {
    group,
    /** 0 = DRS closed (max downforce) … 1 = open (flap flattened). */
    setDrs: (open: number) => {
      drs.rotation.z = DRS_CLOSED + 0.34 * open;
    },
    dispose: () => geometries.forEach((g) => g.dispose()),
  } satisfies { group: Object3D; setDrs: (open: number) => void; dispose: () => void };
}

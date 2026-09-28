import { BufferGeometry, Float32BufferAttribute } from 'three';
import { DIM } from './dimensions';
import { clamp, lerp, pchip, smoothstep } from './interp';

/**
 * 911 GT3 RS body shell built as a LOFT: ~160 cross-sections along the car's length,
 * each generated from a handful of "character lines" (roofline, beltline,
 * fender crests, plan-view width…) and stitched into one smooth mesh.
 *
 * Why not an extruded side profile? An extrusion has the same section
 * everywhere — it can't produce the 911's defining features: fenders that rise
 * above a lower hood, the narrow teardrop greenhouse on a wide body, and the
 * flared rear haunches. A loft gets all of them from a few curves.
 *
 * Half cross-section (z ≥ 0), mirrored for the other side:
 *
 *          top centre ── roof / hood / engine lid (TOP_N points)
 *        ╱
 *   crest ◄── shoulder / fender top (crestY, crestZ)
 *     │   upper side (UPPER_N)
 *     │ ◄── max width (halfWidth @ sideHeight)
 *     ╰── lower corner (CORNER_N)
 *   ┌─┘ wheel-well ceiling (raised to the arch inside the wheel openings)
 *   │   wheel-well inner wall
 *   └──── floor ── bottom centre
 */

// ───────────────────────────── character lines (x → metres) ─────────────────────────────

/** Centreline height: nose → hood → windshield → roof → fastback → ducktail. */
export const roofLine = pchip([
  [-2.33, 0.74],
  [-2.28, 0.84],
  [-2.18, 0.9],
  [-2.08, 0.922],
  [-1.95, 0.945],
  [-1.75, 0.985],
  [-1.4, 1.085],
  [-1.05, 1.195],
  [-0.75, 1.275],
  [-0.45, 1.31],
  [-0.2, 1.3],
  [0.0, 1.245],
  [0.3, 1.055],
  [0.56, 0.87],
  [0.72, 0.79],
  [1.2, 0.72],
  [1.7, 0.655],
  [1.98, 0.6],
  [2.13, 0.52],
  [2.24, 0.4],
]);

/** Underside height: low ride height, splitter-level nose, diffuser kick-up at the tail. */
const floorLine = pchip([
  [-2.33, 0.4],
  [-2.22, 0.3],
  [-2.06, 0.2],
  [-1.85, 0.12],
  [1.8, 0.11],
  [2.05, 0.12],
  [2.18, 0.15],
  [2.24, 0.2],
]);

/** Plan-view half width before nose/tail rounding — wide RS fenders front and rear. */
const halfWidth = pchip([
  [-2.33, 0.9],
  [-2.1, 0.925],
  [-1.75, 0.95],
  [-1.3, 0.955],
  [-0.85, 0.9],
  [-0.4, 0.858],
  [0.3, 0.855],
  [0.75, 0.9],
  [1.2, 0.935],
  [1.65, 0.915],
  [2.24, 0.86],
]);

/** Height at which the body is widest. */
const sideHeight = pchip([
  [-2.33, 0.58],
  [-1.9, 0.6],
  [-1.3, 0.58],
  [-0.6, 0.48],
  [0.5, 0.46],
  [1.2, 0.48],
  [1.9, 0.44],
  [2.24, 0.34],
]);

/** Shoulder / fender crest height. The front fenders stand well proud of the low hood. */
const crestY = pchip([
  [-2.33, 0.72],
  [-2.15, 0.86],
  [-1.9, 0.915],
  [-1.4, 0.94],
  [-1.0, 0.92],
  [-0.5, 0.895],
  [0.2, 0.872],
  [0.56, 0.86],
  [0.9, 0.83],
  [1.2, 0.83],
  [1.55, 0.81],
  [1.85, 0.77],
  [2.08, 0.66],
  [2.24, 0.42],
]);

/** Lateral position of that crest. */
const crestZ = pchip([
  [-2.33, 0.73],
  [-2.0, 0.78],
  [-1.4, 0.81],
  [-0.9, 0.8],
  [-0.3, 0.78],
  [0.3, 0.77],
  [0.56, 0.75],
  [0.8, 0.7],
  [1.2, 0.68],
  [1.7, 0.665],
  [2.0, 0.64],
  [2.24, 0.58],
]);

// Section resolution.
const CORNER_N = 4;
const UPPER_N = 5;
const TOP_N = 12;
/** Points per half section. */
const HALF_N = 4 + CORNER_N + 1 + UPPER_N + TOP_N;
/** Index of the crest point within a half section. */
const CREST = 4 + CORNER_N + 1 + UPPER_N - 1;
/** Points per full ring (centreline points are shared by both halves). */
const RING_N = HALF_N * 2 - 2;

/** 0 = deck-shaped section (hood, engine lid) · 1 = greenhouse section (glass + roof). */
const cabinWeight = (x: number) => smoothstep(-1.88, -1.62, x) * smoothstep(0.74, 0.56, x);

/** Plan-view rounding of nose and tail: section width → 0 at the tips (superellipse). */
function endFactor(x: number) {
  if (x > DIM.noseRoundX) {
    const t = clamp((x - DIM.noseRoundX) / (DIM.noseX - DIM.noseRoundX), 0, 1);
    return Math.pow(1 - Math.pow(t, 2.2), 1 / 2.2);
  }
  if (x < DIM.tailRoundX) {
    const t = clamp((DIM.tailRoundX - x) / (DIM.tailRoundX - DIM.tailX), 0, 1);
    return Math.pow(1 - Math.pow(t, 2.3), 1 / 2.3);
  }
  return 1;
}

/**
 * Where each ring line of the top surface sits (u: 0 = crest … 1 = centreline).
 * Window edges are pinned to fixed ring lines (SILL, SIDE_TOP, UPPER), so the
 * glass outlines follow the mesh instead of stair-stepping across it:
 *
 *   u(SILL)     = 0.08            bottom of the side glass (beltline)
 *   u(SIDE_TOP) = top of side glass — rises along the A-pillar, flat under the
 *                 roof, then tapers back down to a point behind the doors
 *   u(UPPER)    = start of windshield / rear window / roof panel
 */
const SILL = 1;
const SIDE_TOP = 5;
const UPPER = 6;

function topKnots(x: number): number[] {
  const sill = 0.08;
  let side: number;
  let upper: number;
  if (x >= 0) {
    // Windshield zone (and the hood ahead of it): the A-pillar sweeps up and inward.
    const a = lerp(0.06, 0.52, clamp((0.56 - x) / 0.56, 0, 1));
    side = Math.max(sill, a - 0.02);
    upper = Math.max(side + 0.03, a + 0.07);
  } else {
    side = x > -0.95 ? 0.5 : x > -1.5 ? lerp(sill, 0.5, (x + 1.5) / 0.55) : sill;
    upper = 0.6;
  }
  const u = [0, sill];
  for (let k = SILL + 1; k <= SIDE_TOP; k++) u.push(lerp(sill, side, (k - SILL) / (SIDE_TOP - SILL)));
  u.push(upper);
  for (let k = UPPER + 1; k <= TOP_N; k++) u.push(lerp(upper, 1, (k - UPPER) / (TOP_N - UPPER)));
  return u;
}

/** Height of the wheel-arch opening at x, or null outside the arches. */
function archTop(x: number): number | null {
  for (const w of [DIM.front, DIM.rear]) {
    const r = w.radius + DIM.archGap;
    const dx = x - w.x;
    if (Math.abs(dx) < r) return w.radius + Math.sqrt(r * r - dx * dx);
  }
  return null;
}

// ───────────────────────────── cross-section ─────────────────────────────

function halfSection(x: number): [number, number][] {
  const yb = floorLine(x);
  const W = halfWidth(x);
  const arch = archTop(x);
  const yLow = arch === null ? yb : Math.max(yb, arch);
  const ySh = crestY(x);
  const zSh = Math.min(crestZ(x), W - 0.01);
  const yTop = roofLine(x);
  const g = cabinWeight(x);
  const zWell = Math.min(DIM.wellZ, W - 0.2);

  const pts: [number, number][] = [
    [0, yb], // bottom centre
    [zWell, yb], // floor → wheel-well wall (degenerate outside the arches)
    [zWell, yLow], // wall → well ceiling
  ];

  // Lower corner (rocker / arch lip): quarter ellipse up to the widest point.
  const rc = 0.14;
  const rcv = clamp((ySh - yLow) * 0.3, 0.01, 0.14);
  const ySide = clamp(Math.max(sideHeight(x), yLow + rcv), yLow + rcv, ySh - 0.02);
  pts.push([W - rc, yLow]);
  for (let k = 1; k <= CORNER_N; k++) {
    const a = -Math.PI / 2 + (k / CORNER_N) * (Math.PI / 2);
    pts.push([W - rc + rc * Math.cos(a), yLow + rcv + rcv * Math.sin(a)]);
  }
  pts.push([W, ySide]);

  // Upper side: rolls inward from the widest point to the crest.
  for (let k = 1; k <= UPPER_N; k++) {
    const a = (k / UPPER_N) * (Math.PI / 2);
    pts.push([zSh + (W - zSh) * Math.cos(a), ySide + (ySh - ySide) * Math.sin(a)]);
  }

  // Top: crest → centreline, blending two shapes.
  const H = yTop - ySh;
  const knots = topKnots(x);
  for (let k = 1; k <= TOP_N; k++) {
    const s = knots[k];
    // Deck: smooth S from the fender crest into the hood/lid (flat at both ends).
    const zd = zSh * (1 - s);
    const yd = ySh + H * (3 * s * s - 2 * s * s * s);
    // Greenhouse: superellipse rising almost vertically from the sill, with tumblehome.
    const th = s * (Math.PI / 2);
    const c = Math.pow(Math.cos(th), 2 / 2.6);
    const sn = Math.pow(Math.sin(th), 2 / 2.6);
    const zc = zSh * c * (1 - 0.2 * sn);
    const yc = ySh + H * sn;
    pts.push([lerp(zd, zc, g), lerp(yd, yc, g)]);
  }

  const e = endFactor(x);
  return pts.map(([z, y]) => [z * e, y]);
}

// ───────────────────────────── material zones ─────────────────────────────

export const BODY_GROUP = { paint: 0, glass: 1, trim: 2, underbody: 3, carbon: 4 } as const;

/** Top-surface segment j (0 = at the crest) at station x: glass? */
function isGlass(x: number, j: number) {
  const upper = j >= UPPER;
  if (upper) return (x > 0.03 && x < 0.53) || (x > -1.6 && x < -1.0); // windshield · rear window
  const side = j >= SILL && j < SIDE_TOP;
  return side && x > -1.5 && x < 0.56 && !(x > -0.98 && x < -0.92); // door + quarter glass, B-pillar gap
}

/** GT3 RS gills: slats across the top of the front fenders, two stations wide each. */
const louvre = (x: number) => x > 0.9 && x < 1.5 && Math.floor((x - 0.9) / 0.056) % 2 === 0;

function classify(x: number, seg: number, inArch: boolean): number {
  if (seg <= 2) return inArch && seg >= 1 ? BODY_GROUP.trim : BODY_GROUP.underbody;
  if (seg < CREST) {
    const lowerCorner = seg <= 3 + CORNER_N - 1;
    const bumperFace = seg === 3 + CORNER_N;
    if (x > 2.02 && (bumperFace || seg === 3 + CORNER_N - 1)) return BODY_GROUP.trim; // central radiator intake
    if (x < -2.05 && lowerCorner) return BODY_GROUP.trim; // rear diffuser
    if (x > -0.86 && x < 0.76 && seg <= 3 + 1) return BODY_GROUP.carbon; // carbon side skirts
    if ((x > 0.6 && x < 0.625) || (x > -0.935 && x < -0.91)) return BODY_GROUP.trim; // door shut lines
    return BODY_GROUP.paint;
  }
  const j = seg - CREST;
  if (isGlass(x, j)) return BODY_GROUP.glass;
  if (x > -1.02 && x < -0.98 && j >= SILL && j < SIDE_TOP) return BODY_GROUP.trim; // quarter-glass frame
  if (x < -1.86 && x > -2.1 && j >= UPPER + 1) return BODY_GROUP.trim; // engine-lid grille
  // Ahead of the windshield the side-glass ring lines collapse, so the fender top is
  // segments 0, SIDE_TOP and UPPER (u ≈ 0 → 0.28) and the hood proper starts after.
  if ((j === 0 || j === SIDE_TOP || j === UPPER) && louvre(x)) return BODY_GROUP.trim; // fender-top louvres
  if (x > 1.45 && x < 1.76 && (j === UPPER + 2 || j === UPPER + 3)) return BODY_GROUP.trim; // twin hood vents
  return BODY_GROUP.paint;
}

// ───────────────────────────── mesh ─────────────────────────────

function stationXs(): number[] {
  const xs: number[] = [];
  const K = 14;
  // Denser sampling where the end rounding is steep.
  for (let k = 0; k < K; k++) xs.push(lerp(DIM.tailX, DIM.tailRoundX, (k / K) ** 2));
  for (let x = DIM.tailRoundX; x < DIM.noseRoundX; x += 0.028) xs.push(x);
  for (let k = K; k >= 0; k--) xs.push(lerp(DIM.noseX, DIM.noseRoundX, (k / K) ** 2));
  return xs;
}

export function createBodyGeometry(): BufferGeometry {
  const xs = stationXs();
  const positions: number[] = [];
  const archMask: boolean[] = [];

  for (const x of xs) {
    const half = halfSection(x);
    archMask.push(archTop(x) !== null);
    // Ring: + side from bottom centre to top centre, then − side back down.
    for (let r = 0; r < RING_N; r++) {
      const k = r < HALF_N ? r : RING_N - r;
      const [z, y] = half[k];
      positions.push(x, y, r < HALF_N ? z : -z);
    }
  }

  const buckets: number[][] = [[], [], [], [], []];
  for (let i = 0; i < xs.length - 1; i++) {
    const xm = (xs[i] + xs[i + 1]) / 2;
    const inArch = archMask[i] || archMask[i + 1];
    for (let r = 0; r < RING_N; r++) {
      const r1 = (r + 1) % RING_N;
      const a = i * RING_N + r;
      const b = (i + 1) * RING_N + r;
      const c = (i + 1) * RING_N + r1;
      const d = i * RING_N + r1;
      // The ring is one continuous loop (bottom → +z side → top → −z side → bottom),
      // so a single winding faces outward everywhere.
      const seg = r < HALF_N - 1 ? r : RING_N - 1 - r;
      buckets[classify(xm, seg, inArch)].push(a, b, c, a, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const index: number[] = [];
  buckets.forEach((tris, group) => {
    geometry.addGroup(index.length, tris.length, group);
    index.push(...tris);
  });
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

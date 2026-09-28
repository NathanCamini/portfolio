/**
 * Real-world proportions of a 992-generation Porsche 911 Carrera, in metres.
 * The scene uses 1 unit = 1 m. The car faces +X (drives to the right on screen),
 * Y is up and +Z is the side facing the camera.
 *
 *   length 4.52 · width 1.85 · height 1.30 · wheelbase 2.45
 *   front tyres 245/35 R20 (Ø ≈ 0.68 m) · rear tyres 305/30 R21 (Ø ≈ 0.72 m)
 */
export const DIM = {
  noseX: 2.2,
  tailX: -2.32,
  /** Where the plan-view rounding of the nose / tail starts. */
  noseRoundX: 1.95,
  tailRoundX: -1.98,

  front: { x: 1.18, radius: 0.34, width: 0.245, z: 0.745 },
  rear: { x: -1.27, radius: 0.357, width: 0.3, z: 0.765 },

  rimRadius: 0.255,
  /** Clearance between tyre and wheel-arch lip. */
  archGap: 0.045,
  /** Inner wall of the wheel wells (the tyre's inner face is further out). */
  wellZ: 0.56,
} as const;

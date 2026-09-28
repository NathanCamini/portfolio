/**
 * Real-world proportions of a 992-generation Porsche 911 GT3 RS, in metres.
 * The scene uses 1 unit = 1 m. The car faces +X (drives to the right on screen),
 * Y is up and +Z is the side facing the camera.
 *
 *   length 4.57 · width 1.90 · height 1.32 · wheelbase 2.46
 *   front tyres 275/35 R20 (Ø ≈ 0.70 m) · rear tyres 335/30 R21 (Ø ≈ 0.735 m)
 */
export const DIM = {
  noseX: 2.24,
  tailX: -2.33,
  /** Where the plan-view rounding of the nose / tail starts. */
  noseRoundX: 1.98,
  tailRoundX: -1.98,

  front: { x: 1.2, radius: 0.35, width: 0.275, z: 0.79 },
  rear: { x: -1.26, radius: 0.367, width: 0.335, z: 0.8 },

  rimRadius: 0.254,
  /** Clearance between tyre and wheel-arch lip (tight: the RS sits low). */
  archGap: 0.035,
  /** Inner wall of the wheel wells (the tyre's inner face is further out). */
  wellZ: 0.58,
} as const;

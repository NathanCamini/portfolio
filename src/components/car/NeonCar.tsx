'use client';

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from 'motion/react';
import styles from './NeonCar.module.css';

/**
 * Porsche 911 GT3 RS (992) in profile, as neon line art, driven by the scroll.
 *
 *   progress 0.00 → 0.30  drives in from the left while the lines draw themselves
 *   progress 0.30 → 0.75  cruises in the middle of the stage
 *   progress 0.75 → 1.00  launches off to the right
 *
 * Wheel spin follows the distance travelled; the speedometer, speed lines and
 * headlight beam follow how fast the visitor scrolls. Pure SVG + Motion values:
 * no WebGL, no React re-renders while scrolling.
 *
 * Drawing: 1000×340 viewBox, facing right, ground at y≈300, ~0.2 px per mm of
 * the real car (4572 mm long, 2457 mm wheelbase).
 */

const REAR = { x: 276, y: 230 };
const FRONT = { x: 760, y: 230 };
const TOP_SPEED = 296; // km/h, GT3 RS (992)

/** Everything drawn in the body colour; each path "draws" itself via pathLength. */
const BODY_PATHS = [
  // Outline: rear bumper → rear arch → sill → front arch → splitter → nose → hood → roof → fastback → tail
  'M70 262 L190 262 A91.8 91.8 0 1 1 362 262 L674 262 A91.8 91.8 0 1 1 846 262 L925 262 L950 258 C956 240 954 214 944 200 C900 188 760 170 650 146 C610 110 575 78 540 62 C500 50 430 48 390 52 C300 62 220 95 160 118 C120 128 90 132 70 140 C58 146 54 160 52 176 L50 230 C50 248 58 260 70 262',
  // Side glass (DLO) and B-pillar
  'M628 146 C600 114 574 88 544 72 C504 60 444 58 402 64 C362 72 326 90 304 112 L334 146 Z',
  'M428 62 L436 146',
  // Door cut, beltline
  'M646 150 L652 250',
  'M300 150 L660 150',
  // Rear quarter intake
  'M372 176 C384 168 404 166 420 170 L410 200 C394 204 380 200 372 190 Z',
  // Mirror
  'M640 142 C630 128 612 126 604 134 L624 146',
  // Front fender louvers (GT3 RS)
  'M706 178 L718 166 M724 176 L736 164 M742 174 L754 162 M760 173 L772 161 M778 172 L790 160',
  // Swan-neck wing: struts hang the wing from above, plus the element and endplate
  'M150 120 C152 92 142 70 128 56 M206 100 C208 78 198 62 186 52',
  'M58 50 C110 42 182 40 250 48 L246 62 C184 56 116 58 60 66 Z',
  'M58 32 L58 72',
  // Front splitter and rear diffuser fins
  'M880 268 L956 264',
  'M70 262 L64 274 M92 262 L86 274 M114 262 L108 274',
];

function Wheel({
  cx,
  cy,
  spin,
  draw,
}: {
  cx: number;
  cy: number;
  spin: MotionValue<number>;
  draw: MotionValue<number>;
}) {
  const spokes = Array.from({ length: 5 }, (_, i) => i * 72);
  return (
    <g>
      <motion.circle cx={cx} cy={cy} r={70} className={styles.tire} style={{ pathLength: draw }} />
      <motion.g style={{ rotate: spin }}>
        <motion.circle cx={cx} cy={cy} r={48} className={styles.line} style={{ pathLength: draw }} />
        {/* Centre-lock "Y" spokes */}
        {spokes.map((a) => (
          <g key={a} transform={`rotate(${a} ${cx} ${cy})`}>
            <motion.path
              d={`M${cx} ${cy - 12} L${cx - 7} ${cy - 46} M${cx} ${cy - 12} L${cx + 7} ${cy - 46}`}
              className={styles.line}
              style={{ pathLength: draw }}
            />
          </g>
        ))}
        <circle cx={cx} cy={cy} r={9} className={styles.hub} />
      </motion.g>
      {/* Brake caliper doesn't spin */}
      <motion.path
        d={`M${cx + 30} ${cy - 30} A42 42 0 0 1 ${cx + 40} ${cy + 12}`}
        className={styles.caliper}
        style={{ pathLength: draw }}
      />
    </g>
  );
}

export function NeonCar({
  progress,
  label,
  speedLabel,
}: {
  progress: MotionValue<number>;
  label: string;
  speedLabel: string;
}) {
  const reduce = useReducedMotion();

  // ---- Position & drawing (from the section's scroll progress)
  const draw = useTransform(progress, [0, 0.28], reduce ? [1, 1] : [0, 1]);
  const x = useTransform(progress, [0, 0.3, 0.75, 1], reduce ? ['0%', '0%', '0%', '0%'] : ['-70%', '0%', '6%', '130%']);
  const distance = useTransform(progress, [0, 1], [0, 3600]);
  const spin = useTransform(distance, (d) => (reduce ? 0 : d));

  // ---- Speed (from how fast the page scrolls; the launch phase adds its own)
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const launch = useTransform(progress, [0.75, 1], [0, 1], { clamp: true });
  const rawSpeed = useTransform(() => {
    const fromScroll = Math.min(1, Math.abs(velocity.get()) / 3500);
    return Math.max(fromScroll, launch.get() * 0.9);
  });
  const speed = useSpring(rawSpeed, { stiffness: 80, damping: 20 }); // 0..1
  const kmh = useTransform(speed, (s) => Math.round(s * TOP_SPEED));
  const needle = useTransform(speed, [0, 1], [-107, 107]); // the dial arc spans ±107° from the top
  const lines = useTransform(speed, [0.05, 0.6], [0, 1]);
  const beam = useTransform(draw, [0.85, 1], [0, 1]);
  const squat = useTransform(speed, [0, 1], [0, -1.2]); // nose lifts a touch under acceleration

  const roadShift = useTransform(distance, (d) => -(d % 120));

  return (
    <div className={styles.wrap} role="img" aria-label={label}>
      <motion.div className={styles.car} style={{ x }}>
        <svg viewBox="-260 0 1500 340" className={styles.svg} aria-hidden="true">
          <defs>
            <linearGradient id="neon-body" x1="0" x2="1000" y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#a78bfa" />
              <stop offset="0.55" stopColor="#7dd3fc" />
              <stop offset="1" stopColor="#67e8f9" />
            </linearGradient>
            <linearGradient id="neon-beam" x1="950" x2="1240" y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.55" />
              <stop offset="1" stopColor="#e0f2fe" stopOpacity="0" />
            </linearGradient>
            <filter id="neon-glow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Speed lines trailing behind the car */}
          <motion.g style={{ opacity: lines }} className={styles.speedLines}>
            {[70, 120, 170, 215, 255].map((y, i) => (
              <line key={y} x1={-250 + i * 18} x2={30 - i * 10} y1={y} y2={y} />
            ))}
          </motion.g>

          {/* Headlight beam */}
          <motion.path d="M944 196 L1240 150 L1240 262 Z" fill="url(#neon-beam)" style={{ opacity: beam }} />

          <motion.g filter="url(#neon-glow)" style={{ rotate: squat, originX: '50%', originY: '90%' }}>
            {BODY_PATHS.map((d) => (
              <motion.path key={d} d={d} className={styles.body} style={{ pathLength: draw }} />
            ))}
            {/* Headlight and tail light */}
            <motion.ellipse
              cx={912}
              cy={194}
              rx={24}
              ry={8}
              transform="rotate(-10 912 194)"
              className={styles.headlight}
              style={{ opacity: beam }}
            />
            <motion.path d="M54 150 L132 132" className={styles.taillight} style={{ pathLength: draw }} />
            <Wheel cx={REAR.x} cy={REAR.y} spin={spin} draw={draw} />
            <Wheel cx={FRONT.x} cy={FRONT.y} spin={spin} draw={draw} />
          </motion.g>

          {/* Ground reflection */}
          <motion.ellipse cx={515} cy={306} rx={460} ry={10} className={styles.shadow} style={{ opacity: draw }} />
        </svg>
      </motion.div>

      {/* Road: dashes stream past faster the faster you scroll */}
      <div className={styles.road} aria-hidden="true">
        <motion.div className={styles.dashes} style={{ x: roadShift }} />
      </div>

      {/* Speedometer */}
      <div className={styles.gauge} aria-hidden="true">
        <svg viewBox="0 0 120 80" className={styles.dial}>
          <path d="M14 70 A48 48 0 1 1 106 70" className={styles.dialTrack} />
          <motion.path d="M14 70 A48 48 0 1 1 106 70" className={styles.dialFill} style={{ pathLength: speed }} />
          <motion.line
            x1="60"
            y1="56"
            x2="60"
            y2="18"
            className={styles.needle}
            style={{ rotate: needle, originX: 0.5, originY: 1 }}
          />
        </svg>
        <div className={styles.readout}>
          <motion.span className={styles.kmh}>{kmh}</motion.span>
          <span className={styles.unit}>km/h · {speedLabel}</span>
        </div>
      </div>
    </div>
  );
}

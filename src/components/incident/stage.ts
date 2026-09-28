/**
 * DOM side of the incident: finds the page's blocks ("rows"), glitches them
 * away and back with the Web Animations API.
 *
 * WAAPI instead of inline styles on purpose: animations sit above every
 * author style (including Motion's inline ones) while they run, and
 * `cancel()` leaves each element exactly as React rendered it — no leftover
 * `transform`/`filter` to clean up.
 */

/** Rows of the "users table": the navbar plus every top-level block of <main>, in page order. */
export function collectRows(): HTMLElement[] {
  const header = document.querySelector('body > header');
  const main = document.querySelector('main');
  return [header, ...Array.from(main?.children ?? [])].filter((el): el is HTMLElement => el instanceof HTMLElement);
}

/** What the rollback log calls a row: `section#bio`, `div[role=marquee]`, `footer`… */
export function rowLabel(el: Pick<Element, 'tagName' | 'id' | 'getAttribute'>): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const role = el.getAttribute('role');
  return role ? `${tag}[role=${role}]` : tag;
}

function onScreen(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

// Chromatic aberration: a red and a cyan copy pulled apart horizontally.
const rgb = (px: number) => `drop-shadow(${px}px 0 0 #ff2d55) drop-shadow(${-px}px 0 0 #00e5ff)`;

/**
 * One glitch frame: shifted/skewed, clipped to a torn slice (`inset`), colours split
 * by `split` px. `steps(1)` holds it until the next frame, so it jumps instead of sliding.
 */
const glitch = (offset: number, transform: string, slice: string, split: number, opacity = 1): Keyframe => ({
  offset,
  transform,
  clipPath: `inset(${slice})`,
  filter: rgb(split),
  opacity,
  easing: 'steps(1, end)',
});

const WHOLE = '0 0 0 0';
const SHOWN = { opacity: 1, visibility: 'visible', transform: 'none', clipPath: `inset(${WHOLE})`, filter: 'none' };
const GONE = { opacity: 0, visibility: 'hidden', transform: 'scaleY(0)', clipPath: 'inset(50% 0 50% 0)' };
/** Squashed to a bright line: the last frame out, the first frame back. */
const SCANLINE = {
  opacity: 1,
  visibility: 'visible',
  transform: 'scaleY(0.012)',
  clipPath: `inset(${WHOLE})`,
  filter: 'brightness(4)',
};

/** Jitter, torn slices, colour split — then collapse to a line like an old CRT. */
const GLITCH_OUT: Keyframe[] = [
  { ...SHOWN, offset: 0, easing: 'steps(1, end)' },
  glitch(0.08, 'translateX(-14px) skewX(-6deg)', '8% 0 58% 0', 6),
  glitch(0.16, 'translateX(16px)', '52% 0 14% 0', -9),
  glitch(0.24, 'translateX(-5px)', WHOLE, 3, 0.85),
  glitch(0.34, 'translateX(22px) skewX(9deg)', '28% 0 40% 0', 11),
  glitch(0.44, 'none', WHOLE, 2),
  glitch(0.54, 'translateX(-26px)', '68% 0 6% 0', -13, 0.7),
  { ...glitch(0.64, 'translateX(6px)', '18% 0 22% 0', 4, 0.9), easing: 'cubic-bezier(0.7, 0, 0.84, 0)' },
  { ...SCANLINE, offset: 0.86 },
  { ...GONE, offset: 1, filter: 'brightness(4)' },
];

/** The same noise in reverse: a line opens up and the block flickers back into place. */
const GLITCH_IN: Keyframe[] = [
  { ...SCANLINE, offset: 0, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  glitch(0.22, 'translateX(-12px)', '30% 0 34% 0', 8),
  glitch(0.36, 'translateX(14px)', '0 0 58% 0', -7),
  glitch(0.5, 'translateX(-5px)', '44% 0 0 0', 4, 0.6),
  glitch(0.64, 'translateX(3px)', WHOLE, 2),
  glitch(0.78, 'none', WHOLE, 1),
  { ...SHOWN, offset: 1 },
];

const FADE_OUT: Keyframe[] = [
  { opacity: 1, visibility: 'visible' },
  { opacity: 0, visibility: 'hidden' },
];
const FADE_IN: Keyframe[] = [...FADE_OUT].reverse();

/** Visible rows glitch out one after another, this far apart (ms). */
const STAGGER = 120;
const OUT_MS = 700;
const IN_MS = 560;

/**
 * Owns the rows for the duration of one incident. Creating it wipes the page;
 * `restoreUpTo(n)` brings rows back in order; `dispose()` hands everything back
 * untouched (also the escape hatch if the component unmounts mid-incident).
 */
export class Stage {
  private readonly out: Animation[] = [];
  private readonly back = new Set<Animation>();
  private restored = 0;

  constructor(
    private readonly rows: HTMLElement[],
    private readonly reduce: boolean,
  ) {
    let visible = 0;
    for (const row of rows) {
      // Nothing inside a deleted row can be focused, clicked or read out.
      row.inert = true;
      if (reduce) {
        this.out.push(row.animate(FADE_OUT, { duration: 200, fill: 'forwards' }));
      } else if (onScreen(row)) {
        const delay = 40 + visible++ * STAGGER;
        this.out.push(row.animate(GLITCH_OUT, { duration: OUT_MS, delay, fill: 'forwards' }));
      } else {
        // Off-screen: nobody is watching, just drop it.
        this.out.push(row.animate(FADE_OUT, { duration: 1, fill: 'forwards' }));
      }
    }
  }

  /** Brings rows [restored, n) back. The deleting animations stay underneath until the new one ends. */
  restoreUpTo(n: number) {
    for (; this.restored < Math.min(n, this.rows.length); this.restored++) {
      const row = this.rows[this.restored];
      const out = this.out[this.restored];
      row.inert = false;
      if (!this.reduce && !onScreen(row)) {
        out.cancel();
        continue;
      }
      const back = row.animate(this.reduce ? FADE_IN : GLITCH_IN, {
        duration: this.reduce ? 200 : IN_MS,
        fill: 'both',
      });
      this.back.add(back);
      back.finished.then(
        () => {
          out.cancel();
          back.cancel();
          this.back.delete(back);
        },
        () => {}, // cancelled by dispose()
      );
    }
  }

  dispose() {
    for (const a of this.out) a.cancel();
    for (const a of this.back) a.cancel();
    this.back.clear();
    for (const row of this.rows) row.inert = false;
  }
}

/** Freezes page scroll for the duration of the incident; returns the undo. */
export function lockScroll(): () => void {
  const { style } = document.documentElement;
  const previous = { overflow: style.overflow, gutter: style.scrollbarGutter };
  // `stable` keeps the scrollbar's space, so nothing shifts sideways.
  style.scrollbarGutter = 'stable';
  style.overflow = 'hidden';
  return () => {
    style.overflow = previous.overflow;
    style.scrollbarGutter = previous.gutter;
  };
}

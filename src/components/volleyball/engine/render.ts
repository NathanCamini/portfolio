import type { GameStrings } from '@/i18n/types';
import type { Palette } from '@/lib/palette';
import { FIELD } from './constants';
import type { Body, GameState } from './types';

export interface View {
  /** CSS pixels of the stage */
  w: number;
  h: number;
  dpr: number;
}

const FONT = 'Inter, system-ui, sans-serif';

/**
 * Draws one frame. The 960×540 court is uniformly scaled and centred
 * (letterboxed) inside the stage, and everything is drawn with design tokens.
 */
export function renderGame(ctx: CanvasRenderingContext2D, g: GameState, view: View, C: Palette, T: GameStrings) {
  const { w, h, dpr } = view;
  const { W, H, GROUND, NET_X, NET_TOP, NET_W } = FIELD;
  const b = g.ball;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  const s = Math.min(w / W, h / H);
  const ox = (w - W * s) / 2;
  const oy = (h - H * s) / 2;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, ox * dpr, oy * dpr);

  // Night sky, twinkling stars and a glowing moon.
  const sky = ctx.createLinearGradient(0, 0, 0, 430);
  sky.addColorStop(0, C.bg);
  sky.addColorStop(1, C.section);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 430);

  ctx.fillStyle = C.n300;
  for (const [x, y, r] of g.stars) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(g.clock / 40 + x);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  glow(ctx, 820, 92, 26, 76, C.accent);
  ctx.fillStyle = C.n200;
  ctx.beginPath();
  ctx.arc(820, 92, 26, 0, Math.PI * 2);
  ctx.fill();

  // Sea with drifting wave dashes.
  ctx.fillStyle = C.sectionGlow;
  ctx.fillRect(0, 392, W, 42);
  ctx.strokeStyle = C.a700;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const y = 400 + i * 6;
    const off = (g.clock * (0.6 + i * 0.2)) % 120;
    ctx.beginPath();
    for (let x = -120 + off; x < W; x += 120) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40, y);
    }
    ctx.stroke();
  }

  // Sand.
  ctx.fillStyle = C.n800;
  ctx.fillRect(0, 432, W, H - 432);
  ctx.fillStyle = C.n700;
  ctx.fillRect(0, 432, W, 3);

  // Ball shadow on the sand (shrinks with height) — the only hint of depth.
  const sh = Math.max(0.2, 1 - (GROUND - b.y) / 400);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(b.x, GROUND + 4, 16 * sh, 4 * sh, 0, 0, Math.PI * 2);
  ctx.fill();

  // Net: pole, mesh and white tape.
  ctx.fillStyle = C.n500;
  ctx.fillRect(NET_X - 3, NET_TOP - 6, 6, GROUND - NET_TOP + 6);
  ctx.fillStyle = C.a700;
  ctx.fillRect(NET_X - NET_W / 2, NET_TOP, NET_W, 74);
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = 1;
  for (let y = NET_TOP + 8; y < NET_TOP + 74; y += 8) {
    ctx.beginPath();
    ctx.moveTo(NET_X - NET_W / 2, y);
    ctx.lineTo(NET_X + NET_W / 2, y);
    ctx.stroke();
  }
  ctx.fillStyle = C.n100;
  ctx.fillRect(NET_X - NET_W / 2 - 1, NET_TOP - 4, NET_W + 2, 6);

  drawSlime(ctx, g.player, b, C.accent, true, C);
  drawSlime(ctx, g.cpu, b, C.n500, false, C);

  // Ball with a glow and two spinning seams.
  glow(ctx, b.x, b.y, b.r, b.r + 18, C.accent);
  ctx.fillStyle = C.n100;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.a600;
  ctx.lineWidth = 2;
  const spin = g.clock * 0.1;
  for (const start of [spin, spin + 3.1]) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r - 1, start, start + 2);
    ctx.stroke();
  }

  // Scoreboard.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.text;
  ctx.font = `500 48px ${FONT}`;
  ctx.fillText(String(g.score[0]), 400, 74);
  ctx.fillText(String(g.score[1]), 560, 74);
  ctx.fillStyle = C.n500;
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText(T.you, 400, 96);
  ctx.fillText(T.cpu, 560, 96);
  ctx.fillStyle = C.n700;
  ctx.fillRect(479, 44, 2, 34);

  const banner = (big: string, small?: string) => {
    ctx.fillStyle = 'rgba(22,24,38,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.text;
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(big, W / 2, 250);
    if (small) {
      ctx.fillStyle = C.a300;
      ctx.font = `400 17px ${FONT}`;
      ctx.fillText(small, W / 2, 290);
    }
  };

  if (g.phase === 'title') banner(T.title, T.start);
  else if (g.phase === 'over') banner(g.score[0] > g.score[1] ? T.win : T.lose, T.again);
  else if (g.phase === 'point') {
    ctx.fillStyle = g.lastScorer === 0 ? C.a300 : C.n300;
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(g.lastScorer === 0 ? T.pYou : T.pCpu, W / 2, 200);
  }
}

/**
 * Soft halo as a radial gradient. Canvas `shadowBlur` looks the same but is a
 * per-frame Gaussian blur — very slow on software-rendered canvases and weak
 * mobile GPUs — while a gradient fill costs about as much as a plain circle.
 */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, inner: number, outer: number, color: string) {
  const g = ctx.createRadialGradient(x, y, inner * 0.6, x, y, outer);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Half-disc player with an eye that tracks the ball. */
function drawSlime(ctx: CanvasRenderingContext2D, p: Body, ball: Body, color: string, lookRight: boolean, C: Palette) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  const ex = p.x + p.r * 0.42 * (lookRight ? 1 : -1);
  const ey = p.y - p.r * 0.55;
  ctx.fillStyle = C.n100;
  ctx.beginPath();
  ctx.arc(ex, ey, 8, 0, Math.PI * 2);
  ctx.fill();

  const a = Math.atan2(ball.y - ey, ball.x - ex);
  ctx.fillStyle = C.bg;
  ctx.beginPath();
  ctx.arc(ex + Math.cos(a) * 3.5, ey + Math.sin(a) * 3.5, 4, 0, Math.PI * 2);
  ctx.fill();
}

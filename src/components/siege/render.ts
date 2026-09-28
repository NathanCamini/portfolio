import type { TrainerStrings } from '@/i18n/types';
import type { Palette } from '@/lib/palette';
import {
  exposure,
  FIELD,
  HEAD_R,
  HIT_FADE_MS,
  OPENINGS,
  rankFor,
  RANKS,
  ROUND_MS,
  targetGeometry,
  timeLeft,
  type Target,
  type TrainerState,
} from './engine';

export interface View {
  w: number;
  h: number;
  dpr: number;
}

const FONT = 'Inter, system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const WALL = { x: 70, y: 70, w: 820, h: 430 };

/** Maps a pointer position (CSS px inside the canvas) to logical field coordinates. */
export function toField(view: View, px: number, py: number) {
  const s = Math.min(view.w / FIELD.W, view.h / FIELD.H);
  const ox = (view.w - FIELD.W * s) / 2;
  const oy = (view.h - FIELD.H * s) / 2;
  return { x: (px - ox) / s, y: (py - oy) / s };
}

export function renderTrainer(
  ctx: CanvasRenderingContext2D,
  s: TrainerState,
  view: View,
  C: Palette,
  T: TrainerStrings,
  pointer: { x: number; y: number } | null,
  best: number,
) {
  const { w, h, dpr } = view;
  const { W, H } = FIELD;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  const sc = Math.min(w / W, h / H);
  const shakeX = s.shake ? (Math.random() - 0.5) * 10 * s.shake : 0;
  const shakeY = s.shake ? (Math.random() - 0.5) * 10 * s.shake : 0;
  ctx.setTransform(dpr * sc, 0, 0, dpr * sc, ((w - W * sc) / 2 + shakeX) * dpr, ((h - H * sc) / 2 + shakeY) * dpr);

  // Night sky and ground.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, C.bg);
  sky.addColorStop(1, C.section);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.n900;
  ctx.fillRect(0, WALL.y + WALL.h, W, H - WALL.y - WALL.h);

  // Roof line and facade with brick courses.
  ctx.fillStyle = C.n900;
  ctx.beginPath();
  ctx.moveTo(WALL.x - 20, WALL.y);
  ctx.lineTo(W / 2, 18);
  ctx.lineTo(WALL.x + WALL.w + 20, WALL.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.n800;
  ctx.fillRect(WALL.x, WALL.y, WALL.w, WALL.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = WALL.y + 18, row = 0; y < WALL.y + WALL.h; y += 18, row++) {
    ctx.moveTo(WALL.x, y);
    ctx.lineTo(WALL.x + WALL.w, y);
    for (let x = WALL.x + (row % 2 ? 22 : 0); x < WALL.x + WALL.w; x += 44) {
      ctx.moveTo(x, y - 18);
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Bullet holes.
  for (const hole of s.holes) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Openings: dim interior, then targets clipped to the frame, then the frame.
  OPENINGS.forEach((o, i) => {
    const glow = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
    // Warm, lit rooms so the dark operator silhouettes read clearly against them.
    glow.addColorStop(0, '#6b5a7e');
    glow.addColorStop(1, '#2c2438');
    ctx.fillStyle = glow;
    ctx.fillRect(o.x, o.y, o.w, o.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(o.x, o.y, o.w, o.h);
    ctx.clip();
    for (const t of s.targets) if (t.opening === i) drawTarget(ctx, t, s.now, C);
    ctx.restore();

    ctx.strokeStyle = C.n500;
    ctx.lineWidth = 6;
    ctx.strokeRect(o.x - 3, o.y - 3, o.w + 6, o.h + 6);
    if (o.kind === 'window') {
      ctx.fillStyle = C.n700;
      ctx.fillRect(o.x - 10, o.y + o.h + 3, o.w + 20, 8); // sill
    }
  });

  // Hostage warning bubbles above their openings.
  for (const t of s.targets) {
    if (t.kind !== 'hostage' || t.hit || exposure(t, s.now) < 0.3) continue;
    const o = OPENINGS[t.opening];
    ctx.fillStyle = '#f5c542';
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`⚠ ${T.hostage}`, t.x, o.y - 12);
  }

  // Score popups.
  for (const p of s.popups) {
    const k = (s.now - p.at) / 700;
    ctx.globalAlpha = 1 - k;
    ctx.textAlign = 'center';
    ctx.fillStyle = p.kind === 'hostage' ? '#ff5a6a' : p.kind === 'head' ? '#f5c542' : C.a300;
    ctx.font = `700 ${p.kind === 'head' ? 26 : 20}px ${FONT}`;
    ctx.fillText(p.text, p.x, p.y - 20 - k * 40);
    if (p.kind === 'head') {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText(T.headshot, p.x, p.y - 44 - k * 40);
    }
  }
  ctx.globalAlpha = 1;

  drawHud(ctx, s, C, T);

  if (s.phase === 'idle') drawIdle(ctx, C, T, best);
  if (s.phase === 'over') drawOver(ctx, s, C, T, best);

  if (pointer) drawCrosshair(ctx, pointer.x, pointer.y, s.phase === 'playing' ? C.a300 : C.n300);
}

function drawTarget(ctx: CanvasRenderingContext2D, t: Target, now: number, C: Palette) {
  const g = targetGeometry(t, now);
  const dropped = t.hit ? Math.min(1, (now - t.hitAt) / HIT_FADE_MS) : 0;
  ctx.save();
  ctx.translate(0, dropped * 60);
  ctx.globalAlpha = 1 - dropped;
  const hostage = t.kind === 'hostage';

  // Shoulders / body.
  ctx.fillStyle = hostage ? C.n300 : '#101118';
  roundRect(ctx, g.body.x, g.body.y, g.body.w, g.body.h, 14);
  ctx.fill();
  // Head (helmet for operators).
  ctx.fillStyle = hostage ? '#e9d6c4' : '#15161f';
  ctx.beginPath();
  ctx.arc(g.head.x, g.head.y, HEAD_R, 0, Math.PI * 2);
  ctx.fill();
  if (hostage) {
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath();
    ctx.arc(g.head.x, g.head.y - 6, HEAD_R - 3, Math.PI, 0);
    ctx.fill();
  } else {
    // Glowing visor slit.
    ctx.fillStyle = '#ff3b4e';
    ctx.fillRect(g.head.x - 11, g.head.y - 3, 22, 5);
    ctx.fillStyle = C.n700;
    ctx.fillRect(g.body.x + 10, g.body.y + 14, g.body.w - 20, 6); // chest rig
  }
  if (t.hit) {
    ctx.globalAlpha = 0.6 * (1 - dropped);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(g.head.x, g.head.y, HEAD_R + 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, s: TrainerState, C: Palette, T: TrainerStrings) {
  const { W } = FIELD;
  ctx.fillStyle = 'rgba(10,11,20,0.72)';
  ctx.fillRect(0, 0, W, 44);
  const left = timeLeft(s);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 42, (left / ROUND_MS) * W, 2);

  ctx.textBaseline = 'middle';
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = C.n500;
  ctx.textAlign = 'left';
  ctx.fillText(T.score, 20, 22);
  ctx.textAlign = 'center';
  ctx.fillText(T.time, W / 2 - 34, 22);
  ctx.textAlign = 'right';
  ctx.fillText(T.streak, W - 70, 22);

  ctx.font = `700 20px ${MONO}`;
  ctx.fillStyle = C.text;
  ctx.textAlign = 'left';
  ctx.fillText(String(s.score), 76, 23);
  ctx.textAlign = 'center';
  ctx.fillStyle = left < 5000 && s.phase === 'playing' ? '#ff5a6a' : C.text;
  ctx.fillText((left / 1000).toFixed(1), W / 2 + 22, 23);
  ctx.textAlign = 'right';
  ctx.fillStyle = s.streak >= 5 ? '#f5c542' : C.text;
  ctx.fillText(`x${s.streak}`, W - 20, 23);
  ctx.textBaseline = 'alphabetic';
}

function overlay(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(12,13,24,0.72)';
  ctx.fillRect(0, 44, FIELD.W, FIELD.H - 44);
}

function drawIdle(ctx: CanvasRenderingContext2D, C: Palette, T: TrainerStrings, best: number) {
  const { W } = FIELD;
  overlay(ctx);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.text;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(T.title, W / 2, 210);
  ctx.fillStyle = C.a300;
  ctx.font = `500 18px ${FONT}`;
  ctx.fillText(T.start, W / 2, 250);

  // Rank ladder.
  const step = 100;
  const x0 = W / 2 - ((RANKS.length - 1) * step) / 2;
  RANKS.forEach((r, i) => {
    hexagon(ctx, x0 + i * step, 330, 16, r.color);
    ctx.fillStyle = C.n300;
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(r.name, x0 + i * step, 368);
  });
  if (best > 0) {
    ctx.fillStyle = C.n500;
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText(`${T.best}: ${best} · ${rankFor(best).name}`, W / 2, 420);
  }
}

function drawOver(ctx: CanvasRenderingContext2D, s: TrainerState, C: Palette, T: TrainerStrings, best: number) {
  const { W } = FIELD;
  overlay(ctx);
  const rank = rankFor(s.score);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.n400;
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(T.rank.toUpperCase(), W / 2, 140);
  hexagon(ctx, W / 2, 205, 46, rank.color);
  ctx.fillStyle = C.text;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(rank.name, W / 2, 300);
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const hs = s.hits ? Math.round((s.headshots / s.hits) * 100) : 0;
  ctx.font = `500 16px ${MONO}`;
  ctx.fillStyle = C.a300;
  ctx.fillText(`${s.score} pts · ${acc}% acc · ${hs}% HS · x${s.bestStreak}`, W / 2, 340);
  ctx.fillStyle = C.n500;
  ctx.font = `500 14px ${FONT}`;
  ctx.fillText(`${T.best}: ${best}`, W / 2, 372);
  ctx.fillStyle = C.text;
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(T.again, W / 2, 430);
}

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.moveTo(x + dx * 6, y + dy * 6);
    ctx.lineTo(x + dx * 16, y + dy * 16);
  }
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function hexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

import type { GameStrings } from '@/i18n/types';
import type { Palette } from '@/lib/palette';
import { FIELD } from './constants';
import { playerWon } from './physics';
import type { Stage } from './stages';
import type { Body, GameState } from './types';

export interface View {
  /** CSS pixels of the stage */
  w: number;
  h: number;
  dpr: number;
}

const FONT = 'Inter, system-ui, sans-serif';

/** Colours of one arena. The beach uses the design tokens; the boss's inferno is its own. */
interface Scene {
  skyTop: string;
  skyBottom: string;
  moon: string;
  moonGlow: string;
  moonR: number;
  sea: string;
  wave: string;
  ground: string;
  groundEdge: string;
  pole: string;
  mesh: string;
  tape: string;
  cpu: string;
  banner: string;
  title: string;
  subtitle: string;
}

const beach = (C: Palette): Scene => ({
  skyTop: C.bg,
  skyBottom: C.section,
  moon: C.n200,
  moonGlow: C.accent,
  moonR: 26,
  sea: C.sectionGlow,
  wave: C.a700,
  ground: C.n800,
  groundEdge: C.n700,
  pole: C.n500,
  mesh: C.a700,
  tape: C.n100,
  cpu: C.n500,
  banner: 'rgba(22,24,38,0.55)',
  title: C.text,
  subtitle: C.a300,
});

const INFERNO: Scene = {
  skyTop: '#140304',
  skyBottom: '#560c0c',
  moon: '#d62828',
  moonGlow: '#ff3b30',
  moonR: 34,
  sea: '#6b0f0f',
  wave: '#ff6b2c',
  ground: '#261111',
  groundEdge: '#4d1b1b',
  pole: '#3d2727',
  mesh: '#8b1e1e',
  tape: '#ffb4a2',
  cpu: '#e5383b',
  banner: 'rgba(36,0,0,0.62)',
  title: '#ff5a4f',
  subtitle: '#ffb4a2',
};

const sceneFor = (stage: Stage, C: Palette) => (stage.theme === 'inferno' ? INFERNO : beach(C));

/**
 * Draws one frame. The 960×540 court is uniformly scaled and centred
 * (letterboxed) inside the stage, and everything is drawn with design tokens —
 * except the boss arena, which turns the night beach into a red inferno.
 */
export function renderGame(ctx: CanvasRenderingContext2D, g: GameState, view: View, C: Palette, T: GameStrings) {
  const { w, h, dpr } = view;
  const { W, H, GROUND, NET_X, NET_TOP, NET_W } = FIELD;
  const b = g.ball;
  const S = sceneFor(g.stage, C);
  const inferno = g.stage.theme === 'inferno';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  const s = Math.min(w / W, h / H);
  // The boss's points shake the arena for a moment.
  const hit = inferno && g.phase === 'point' && g.lastScorer === 1 ? Math.max(0, 1 - g.phaseTime / 400) : 0;
  const shake = hit * 6 * Math.sin(g.clock * 2.3);
  const ox = (w - W * s) / 2 + shake * s;
  const oy = (h - H * s) / 2;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, ox * dpr, oy * dpr);

  // Sky, then twinkling stars (beach) or rising embers (inferno), and the moon.
  const sky = ctx.createLinearGradient(0, 0, 0, 430);
  sky.addColorStop(0, S.skyTop);
  sky.addColorStop(1, S.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 430);

  if (inferno) {
    ctx.fillStyle = '#ff8a3d';
    for (const [x, y, r] of g.stars) {
      const rise = (g.clock * (0.5 + r * 0.4) + y * 3) % 440;
      const ey = 432 - rise;
      ctx.globalAlpha = Math.max(0, 0.85 - rise / 480);
      ctx.beginPath();
      ctx.arc(x + Math.sin(g.clock / 26 + x) * 7, ey, r * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = C.n300;
    for (const [x, y, r] of g.stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(g.clock / 40 + x);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  glow(ctx, 820, 92, S.moonR, S.moonR * 2.9, S.moonGlow);
  ctx.fillStyle = S.moon;
  ctx.beginPath();
  ctx.arc(820, 92, S.moonR, 0, Math.PI * 2);
  ctx.fill();

  // Sea (or lava) with drifting wave dashes.
  ctx.fillStyle = S.sea;
  ctx.fillRect(0, 392, W, 42);
  ctx.strokeStyle = S.wave;
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

  // Sand (or scorched rock).
  ctx.fillStyle = S.ground;
  ctx.fillRect(0, 432, W, H - 432);
  ctx.fillStyle = S.groundEdge;
  ctx.fillRect(0, 432, W, 3);

  // Ball shadow on the ground (shrinks with height) — the only hint of depth.
  const sh = Math.max(0.2, 1 - (GROUND - b.y) / 400);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(b.x, GROUND + 4, 16 * sh, 4 * sh, 0, 0, Math.PI * 2);
  ctx.fill();

  // Net: pole, mesh and tape.
  ctx.fillStyle = S.pole;
  ctx.fillRect(NET_X - 3, NET_TOP - 6, 6, GROUND - NET_TOP + 6);
  ctx.fillStyle = S.mesh;
  ctx.fillRect(NET_X - NET_W / 2, NET_TOP, NET_W, 74);
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = 1;
  for (let y = NET_TOP + 8; y < NET_TOP + 74; y += 8) {
    ctx.beginPath();
    ctx.moveTo(NET_X - NET_W / 2, y);
    ctx.lineTo(NET_X + NET_W / 2, y);
    ctx.stroke();
  }
  ctx.fillStyle = S.tape;
  ctx.fillRect(NET_X - NET_W / 2 - 1, NET_TOP - 4, NET_W + 2, 6);

  drawSlime(ctx, g.player, b, C.accent, true, C);
  if (inferno) glow(ctx, g.cpu.x, g.cpu.y - g.cpu.r * 0.4, g.cpu.r * 0.6, g.cpu.r * 1.9, S.moonGlow);
  drawSlime(ctx, g.cpu, b, S.cpu, false, C, inferno);

  // Ball with a glow and two spinning seams.
  glow(ctx, b.x, b.y, b.r, b.r + 18, inferno ? S.wave : C.accent);
  ctx.fillStyle = C.n100;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = inferno ? '#c1121f' : C.a600;
  ctx.lineWidth = 2;
  const spin = g.clock * 0.1;
  for (const start of [spin, spin + 3.1]) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r - 1, start, start + 2);
    ctx.stroke();
  }

  // The inferno breathes: a pulsing red vignette, and a flash when the boss scores.
  if (inferno) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    v.addColorStop(0, 'rgba(120,0,0,0)');
    v.addColorStop(1, `rgba(150,0,0,${0.4 + 0.12 * Math.sin(g.clock / 18)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    if (hit) {
      ctx.fillStyle = `rgba(255,30,30,${0.22 * hit})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Scoreboard. Endless shows how close the CPU is to ending the run.
  const endless = g.stage.mode === 'endless';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.text;
  ctx.font = `500 48px ${FONT}`;
  ctx.fillText(String(g.score[0]), 400, 74);
  ctx.fillText(endless ? `${g.score[1]}/${g.stage.limits[1]}` : String(g.score[1]), 560, 74);
  ctx.fillStyle = inferno ? S.subtitle : C.n500;
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText(T.you, 400, 96);
  ctx.fillText(inferno ? T.boss : T.cpu, 560, 96);
  ctx.fillStyle = inferno ? S.groundEdge : C.n700;
  ctx.fillRect(479, 44, 2, 34);

  const banner = (big: string, small: string, hint?: string) => {
    ctx.fillStyle = S.banner;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = S.title;
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(big, W / 2, 238);
    ctx.fillStyle = S.subtitle;
    ctx.font = `400 17px ${FONT}`;
    ctx.fillText(small, W / 2, 276);
    if (hint) {
      ctx.fillStyle = inferno ? S.tape : C.n300;
      ctx.font = `400 14px ${FONT}`;
      ctx.fillText(hint, W / 2, 308);
    }
  };

  const stageText = T.stages[g.stage.id];
  if (g.phase === 'title') banner(stageText.title, stageText.sub, T.start);
  else if (g.phase === 'over') {
    const won = playerWon(g);
    if (endless) banner(T.endlessOver.replace('{n}', String(g.score[0])), T.again);
    else if (g.stage.id === 'boss') banner(won ? T.bossWin : T.bossLose, won ? T.rematch : T.retry);
    else banner(won ? T.phaseClear : T.lose, won ? T.toBoss : T.retry);
  } else if (g.phase === 'point') {
    ctx.fillStyle = g.lastScorer === 0 ? C.a300 : inferno ? S.title : C.n300;
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(g.lastScorer === 0 ? T.pYou : inferno ? T.pBoss : T.pCpu, W / 2, 200);
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

/** Half-disc player with an eye that tracks the ball; the boss gets horns and a scowl. */
function drawSlime(
  ctx: CanvasRenderingContext2D,
  p: Body,
  ball: Body,
  color: string,
  lookRight: boolean,
  C: Palette,
  boss = false,
) {
  if (boss) {
    ctx.fillStyle = '#f1e3d3';
    for (const dir of [-1, 1]) {
      const bx = p.x + dir * p.r * 0.5;
      const by = p.y - p.r * 0.78;
      ctx.beginPath();
      ctx.moveTo(bx - dir * 11, by + 6);
      ctx.quadraticCurveTo(bx + dir * 4, by - 16, bx + dir * 16, by - 30);
      ctx.quadraticCurveTo(bx + dir * 8, by - 8, bx + dir * 11, by + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  const ex = p.x + p.r * 0.42 * (lookRight ? 1 : -1);
  const ey = p.y - p.r * 0.55;
  ctx.fillStyle = boss ? '#ffe066' : C.n100;
  ctx.beginPath();
  ctx.arc(ex, ey, boss ? 9 : 8, 0, Math.PI * 2);
  ctx.fill();

  const a = Math.atan2(ball.y - ey, ball.x - ex);
  ctx.fillStyle = boss ? '#2b0000' : C.bg;
  ctx.beginPath();
  ctx.arc(ex + Math.cos(a) * 3.5, ey + Math.sin(a) * 3.5, 4, 0, Math.PI * 2);
  ctx.fill();

  if (boss) {
    // Brow slanting down towards the nose: angry.
    const dir = lookRight ? 1 : -1;
    ctx.strokeStyle = '#2b0000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 12, ey - 17);
    ctx.lineTo(ex + dir * 10, ey - 9);
    ctx.stroke();
  }
}

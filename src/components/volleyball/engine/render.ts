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

/** Colours of one arena. The beach uses the design tokens; the bug's red alert is its own. */
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

/** The boss arena: a production incident — red-alert sky, alarm light, glitching pixels. */
const RED_ALERT: Scene = {
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

const sceneFor = (stage: Stage, C: Palette) => (stage.theme === 'bug' ? RED_ALERT : beach(C));

/**
 * Draws one frame. The 960×540 court is uniformly scaled and centred
 * (letterboxed) inside the stage, and everything is drawn with design tokens —
 * except the boss arena, where a bug has taken the night beach down: red alert.
 */
export function renderGame(ctx: CanvasRenderingContext2D, g: GameState, view: View, C: Palette, T: GameStrings) {
  const { w, h, dpr } = view;
  const { W, H, GROUND, NET_X, NET_TOP, NET_W } = FIELD;
  const b = g.ball;
  const S = sceneFor(g.stage, C);
  const bug = g.stage.theme === 'bug';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  const s = Math.min(w / W, h / H);
  // The boss's points shake the arena for a moment.
  const hit = bug && g.phase === 'point' && g.lastScorer === 1 ? Math.max(0, 1 - g.phaseTime / 400) : 0;
  const shake = hit * 6 * Math.sin(g.clock * 2.3);
  const ox = (w - W * s) / 2 + shake * s;
  const oy = (h - H * s) / 2;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, ox * dpr, oy * dpr);

  // Sky, then twinkling stars (beach) or rising glitch pixels (bug), and the moon / alarm light.
  const sky = ctx.createLinearGradient(0, 0, 0, 430);
  sky.addColorStop(0, S.skyTop);
  sky.addColorStop(1, S.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 430);

  if (bug) {
    g.stars.forEach(([x, y, r], i) => {
      const rise = (g.clock * (0.5 + r * 0.4) + y * 3) % 440;
      const size = 2 + Math.round(r * 2);
      ctx.globalAlpha = Math.max(0, 0.85 - rise / 480);
      ctx.fillStyle = i % 3 === 0 ? '#39e6ff' : '#ff5a3c';
      // Pixels snap sideways now and then instead of drifting: they're glitches, not sparks.
      const jump = Math.sin(g.clock / 9 + i) > 0.92 ? 8 : 0;
      ctx.fillRect(Math.round(x + jump), Math.round(432 - rise), size, size);
    });
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

  drawSea(ctx, S, g.clock / 60);

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
  if (bug) {
    glow(ctx, g.cpu.x, g.cpu.y - g.cpu.r * 0.4, g.cpu.r * 0.6, g.cpu.r * 1.9, S.moonGlow);
    // It glitches while it misreads a ball — and in short random flickers.
    const glitching = g.cpuMiss !== 0 && b.x > NET_X ? 1 : Math.sin(g.clock / 7) > 0.97 ? 0.6 : 0;
    drawBug(ctx, g.cpu, b, g.clock, glitching);
  } else {
    drawSlime(ctx, g.cpu, b, S.cpu, false, C);
  }

  // Ball with a glow and two spinning seams.
  glow(ctx, b.x, b.y, b.r, b.r + 18, bug ? S.wave : C.accent);
  ctx.fillStyle = C.n100;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = bug ? '#c1121f' : C.a600;
  ctx.lineWidth = 2;
  const spin = g.clock * 0.1;
  for (const start of [spin, spin + 3.1]) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r - 1, start, start + 2);
    ctx.stroke();
  }

  // Red alert: a pulsing red vignette, and a flash when the bug scores.
  if (bug) {
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

  // Scoreboard.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.text;
  ctx.font = `500 48px ${FONT}`;
  ctx.fillText(String(g.score[0]), 400, 74);
  ctx.fillText(String(g.score[1]), 560, 74);
  ctx.fillStyle = bug ? S.subtitle : C.n500;
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText(T.you, 400, 96);
  ctx.fillText(bug ? T.boss : T.cpu, 560, 96);
  ctx.fillStyle = bug ? S.groundEdge : C.n700;
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
      ctx.fillStyle = bug ? S.tape : C.n300;
      ctx.font = `400 14px ${FONT}`;
      ctx.fillText(hint, W / 2, 308);
    }
  };

  if (g.phase === 'title') {
    const stageText = T.stages[g.stage.id];
    banner(stageText.title, stageText.sub, T.start);
  } else if (g.phase === 'over') {
    const won = playerWon(g);
    if (g.stage.id === 'boss') banner(won ? T.bossWin : T.bossLose, won ? T.rematch : T.retry);
    else banner(won ? T.phaseClear : T.lose, won ? T.toBoss : T.retry);
  } else if (g.phase === 'point') {
    ctx.fillStyle = g.lastScorer === 0 ? C.a300 : bug ? S.title : C.n300;
    ctx.font = `500 26px ${FONT}`;
    const theirs = bug ? T.pBoss : T.pCpu;
    ctx.fillText(g.lastScorer === 0 ? T.pYou : theirs, W / 2, 200);
  }
}

const SEA_TOP = 392;
const SHORE = 432;
const MOON_X = 820;

/** A repeatable 0..1 number per wave crest, so each one bobs and fades on its own rhythm. */
const hash = (i: number, row: number) => {
  const v = Math.sin(i * 12.9898 + row * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * The sea (or the lava lake) behind the court, at night: a calm surface, not
 * a current. Nothing slides sideways. Wave crests sit at fixed spots, bob a
 * few pixels and fade in and out, each on its own slow rhythm; rows further
 * away are thinner and closer together; the moon lays a shimmering path on
 * the water; and every few seconds a line of foam washes up on the sand.
 * `t` is in seconds.
 */
function drawSea(ctx: CanvasRenderingContext2D, S: Scene, t: number) {
  const { W } = FIELD;
  ctx.fillStyle = S.sea;
  ctx.fillRect(0, SEA_TOP, W, SHORE - SEA_TOP);
  ctx.save();
  ctx.lineCap = 'round';

  // Wave crests, far (top) to near (bottom).
  ctx.strokeStyle = S.wave;
  for (let row = 0; row < 4; row++) {
    const y = SEA_TOP + 5 + row * (4 + row * 2);
    const gap = 64 + row * 26;
    const len = 10 + row * 9;
    ctx.lineWidth = 1 + row * 0.5;
    for (let i = 0; i * gap < W + gap; i++) {
      const h = hash(i, row);
      const x = i * gap + h * gap * 0.6 - gap / 2 + Math.sin(t * 0.8 + h * 6.3) * (2 + row);
      ctx.globalAlpha = 0.18 + 0.42 * (0.5 + 0.5 * Math.sin(t * (0.5 + h * 0.4) + h * 9));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
  }

  // The moon's reflection: short strokes under it that breathe in and out.
  ctx.strokeStyle = S.moon;
  ctx.lineWidth = 1.5;
  for (let y = SEA_TOP + 3; y < SHORE - 4; y += 4) {
    const depth = (y - SEA_TOP) / (SHORE - SEA_TOP);
    const half = (5 + depth * 16) * (0.55 + 0.45 * Math.sin(t * 1.3 + y * 0.9));
    ctx.globalAlpha = 0.28 - depth * 0.12;
    ctx.beginPath();
    ctx.moveTo(MOON_X - half, y);
    ctx.lineTo(MOON_X + half, y);
    ctx.stroke();
  }

  // Foam washing up on the sand: comes in slowly, then fades (a wave every ~5 s).
  const swell = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 5);
  ctx.strokeStyle = S.moon;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.12 + 0.3 * swell;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 12) {
    const y = SHORE - 1 - swell * 3 + Math.sin(x / 37 + t * 0.7) * 1.2;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
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

const SHELL = '#e0322f';
const INK = '#17090c';

/**
 * The boss: a ladybug facing the player — spotted shell over the same
 * half-disc the physics uses, black head with an eye on the ball, waving
 * antennae and scuttling legs. `glitch` (0–1) overlays cyan and magenta
 * ghosts and a torn slice, like a corrupted frame.
 */
function drawBug(ctx: CanvasRenderingContext2D, p: Body, ball: Body, clock: number, glitch: number) {
  const { x, y, r } = p;
  const moving = Math.abs(p.vx) > 0.5 || y < FIELD.GROUND;

  // Legs: three a side, stepping while it moves.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const lift = moving ? Math.max(0, Math.sin(clock * 0.45 + i * 2.1 + (side > 0 ? Math.PI : 0))) * 5 : 0;
      const hip = x + side * r * (0.35 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(hip, y - 6);
      ctx.lineTo(hip + side * 9, y - 12 - lift);
      ctx.lineTo(hip + side * 15, y - lift * 0.4);
      ctx.stroke();
    }
  }

  // Shell with a centre seam and spots.
  ctx.fillStyle = SHELL;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.12, y - r);
  ctx.lineTo(x + r * 0.12, y);
  ctx.stroke();
  ctx.fillStyle = INK;
  for (const [sx, sy, sr] of [
    [0.45, 0.35, 0.13],
    [0.62, 0.72, 0.1],
    [-0.12, 0.62, 0.12],
    [0.28, 0.78, 0.09],
    [-0.02, 0.3, 0.09],
  ]) {
    ctx.beginPath();
    ctx.arc(x + sx * r, y - sy * r, sr * r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head at the front (towards the player), with antennae.
  const hx = x - r * 0.72;
  const hy = y - r * 0.42;
  const hr = r * 0.4;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  // Two antennae in a V: one leaning forward, one up and back.
  for (const [baseX, tipDX, tipDY, phase] of [
    [-0.35, -26, -24, 0],
    [0.25, 6, -34, 1.7],
  ]) {
    const wave = Math.sin(clock / 11 + phase) * 5;
    const rootX = hx + hr * baseX;
    const rootY = hy - hr * 0.85;
    const tipX = rootX + tipDX + wave * 0.6;
    const tipY = rootY + tipDY + wave;
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(rootX + tipDX * 0.2, tipY + 6, tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();

  // One big eye on the ball.
  const ex = hx - hr * 0.3;
  const ey = hy - hr * 0.2;
  ctx.fillStyle = '#fff4e6';
  ctx.beginPath();
  ctx.arc(ex, ey, 8, 0, Math.PI * 2);
  ctx.fill();
  const a = Math.atan2(ball.y - ey, ball.x - ex);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(ex + Math.cos(a) * 3.5, ey + Math.sin(a) * 3.5, 4, 0, Math.PI * 2);
  ctx.fill();

  if (glitch) {
    // Corrupted frame: cyan and magenta ghosts pulled apart, plus a torn slice of shell.
    const dx = 8 * glitch * (Math.sin(clock * 3.1) > 0 ? 1 : -1);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.5 * glitch;
    for (const [color, off] of [
      ['#39e6ff', -dx],
      ['#ff2bd6', dx],
    ] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + off, y, r, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.85 * glitch;
    ctx.fillStyle = SHELL;
    const band = y - r * (0.35 + 0.3 * Math.abs(Math.sin(clock * 0.7)));
    ctx.fillRect(x - r + dx * 1.5, band, r * 2, 5);
    ctx.globalAlpha = 1;
  }
}

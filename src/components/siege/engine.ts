/**
 * "Peek Trainer" — a tiny Siege-style aim trainer. Pure TypeScript, no DOM:
 * the component feeds it time and clicks, the renderer draws its state.
 *
 * Operators peek from the openings of a house facade for a short window;
 * headshots are worth more, hitting a hostage costs points, and consecutive
 * hits build a multiplier. 30 seconds, then a rank from Copper to Champion.
 */

export const FIELD = { W: 960, H: 540 } as const;
export const ROUND_MS = 30_000;

/** Target pacing: the first peek, then a gap that shrinks as the round goes on. */
export const SPAWN = { FIRST_MS: 500, GAP_MS: 650, GAP_PRESSURE_MS: 250, GAP_JITTER_MS: 200 } as const;

/** Most targets a round can ever show: the first peek, then one per shortest gap. */
export const MAX_TARGETS = Math.floor((ROUND_MS - SPAWN.FIRST_MS) / (SPAWN.GAP_MS - SPAWN.GAP_PRESSURE_MS)) + 1;

/** Points for a hit: 100 head / 50 body, ×1.1 per hit already in the streak (up to ×2). */
export const hitPoints = (head: boolean, streak: number) =>
  Math.round((head ? 100 : 50) * (1 + Math.min(streak, 10) * 0.1));

/** Points lost for shooting a hostage. */
export const HOSTAGE_PENALTY = 150;

export interface Opening {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'window' | 'door';
}

/** The facade: two floors of windows and a door in the middle. */
export const OPENINGS: Opening[] = [
  { x: 150, y: 110, w: 140, h: 120, kind: 'window' },
  { x: 410, y: 110, w: 140, h: 120, kind: 'window' },
  { x: 670, y: 110, w: 140, h: 120, kind: 'window' },
  { x: 150, y: 300, w: 140, h: 120, kind: 'window' },
  { x: 425, y: 290, w: 110, h: 190, kind: 'door' },
  { x: 670, y: 300, w: 140, h: 120, kind: 'window' },
];

export const HEAD_R = 17;
const RISE_MS = 140;
export const HIT_FADE_MS = 260;

export type TargetKind = 'enemy' | 'hostage';

export interface Target {
  id: number;
  opening: number;
  kind: TargetKind;
  /** Horizontal centre inside the opening. */
  x: number;
  born: number;
  /** Time fully up before hiding again. */
  life: number;
  hit: boolean;
  /** When it was shot (it drops out of view for a moment, then is removed). */
  hitAt: number;
}

export type HitResult = 'head' | 'body' | 'hostage' | 'miss';

export interface Popup {
  x: number;
  y: number;
  text: string;
  kind: HitResult;
  at: number;
}

export interface TrainerState {
  phase: 'idle' | 'playing' | 'over';
  startedAt: number;
  now: number;
  score: number;
  streak: number;
  bestStreak: number;
  shots: number;
  hits: number;
  headshots: number;
  targets: Target[];
  holes: { x: number; y: number }[];
  popups: Popup[];
  nextSpawn: number;
  nextId: number;
  shake: number;
}

export const RANKS = [
  { name: 'Copper', min: 0, color: '#b0643c' },
  { name: 'Bronze', min: 600, color: '#c58b4c' },
  { name: 'Silver', min: 1300, color: '#b8c0cc' },
  { name: 'Gold', min: 2100, color: '#e2b714' },
  { name: 'Platinum', min: 2900, color: '#3fc6c2' },
  { name: 'Emerald', min: 3700, color: '#2fbf71' },
  { name: 'Diamond', min: 4600, color: '#8f7cf7' },
  { name: 'Champion', min: 5600, color: '#e8445a' },
] as const;

export type Rank = (typeof RANKS)[number];

export function rankFor(score: number): Rank {
  let r: Rank = RANKS[0];
  for (const rank of RANKS) if (score >= rank.min) r = rank;
  return r;
}

export function createTrainer(): TrainerState {
  return {
    phase: 'idle',
    startedAt: 0,
    now: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    targets: [],
    holes: [],
    popups: [],
    nextSpawn: 0,
    nextId: 1,
    shake: 0,
  };
}

export function startRound(s: TrainerState, now: number) {
  Object.assign(s, createTrainer(), { phase: 'playing', startedAt: now, now, nextSpawn: now + SPAWN.FIRST_MS });
}

/** 0 at the start of the round → 1 at the end: peeks get shorter and more frequent. */
const pressure = (s: TrainerState) => Math.min(1, (s.now - s.startedAt) / ROUND_MS);

export function timeLeft(s: TrainerState) {
  return s.phase === 'playing' ? Math.max(0, ROUND_MS - (s.now - s.startedAt)) : 0;
}

/** How far a target has risen into its opening: 0 hidden … 1 fully up. */
export function exposure(t: Target, now: number) {
  const age = now - t.born;
  if (age < RISE_MS) return age / RISE_MS;
  if (age < RISE_MS + t.life) return 1;
  return Math.max(0, 1 - (age - RISE_MS - t.life) / RISE_MS);
}

/** Head centre and body box of a target at the current exposure. */
export function targetGeometry(t: Target, now: number) {
  const o = OPENINGS[t.opening];
  const floor = o.y + o.h;
  const bodyH = o.kind === 'door' ? 120 : 80;
  const standing = floor - bodyH - HEAD_R * 2 - 6; // head top when fully up
  const hidden = floor + 4;
  const top = hidden + (standing - hidden) * exposure(t, now);
  const head = { x: t.x, y: top + HEAD_R };
  const body = { x: t.x - 30, y: top + HEAD_R * 2 + 4, w: 60, h: bodyH };
  return { head, body, clip: o };
}

export function update(s: TrainerState, now: number, rng: () => number = Math.random) {
  s.now = now;
  s.shake = Math.max(0, s.shake - 0.08);
  s.popups = s.popups.filter((p) => now - p.at < 700);
  if (s.phase !== 'playing') return;

  if (now - s.startedAt >= ROUND_MS) {
    s.phase = 'over';
    s.targets = [];
    return;
  }

  // Retire targets that finished hiding (or were hit a moment ago). An enemy
  // that got away breaks the streak — you let them peek for free.
  s.targets = s.targets.filter((t) => {
    const gone = t.hit ? now - t.hitAt > HIT_FADE_MS : now - t.born > RISE_MS * 2 + t.life;
    if (gone && !t.hit && t.kind === 'enemy') s.streak = 0;
    return !gone;
  });

  const p = pressure(s);
  if (now >= s.nextSpawn && s.targets.length < 2 + Math.round(p * 2)) {
    const free = OPENINGS.map((_, i) => i).filter((i) => !s.targets.some((t) => t.opening === i));
    if (free.length) {
      const opening = free[Math.floor(rng() * free.length)];
      const o = OPENINGS[opening];
      s.targets.push({
        id: s.nextId++,
        opening,
        kind: rng() < 0.16 ? 'hostage' : 'enemy',
        x: o.x + 36 + rng() * (o.w - 72),
        born: now,
        life: 1150 - 600 * p + rng() * 250,
        hit: false,
        hitAt: 0,
      });
    }
    s.nextSpawn = now + SPAWN.GAP_MS - SPAWN.GAP_PRESSURE_MS * p + rng() * SPAWN.GAP_JITTER_MS;
  }
}

const inCircle = (px: number, py: number, cx: number, cy: number, r: number) =>
  (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
const inRect = (px: number, py: number, r: { x: number; y: number; w: number; h: number }) =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

/** Fires at logical coordinates (x, y). Returns what was hit. */
export function shoot(s: TrainerState, x: number, y: number): HitResult {
  if (s.phase !== 'playing') return 'miss';
  s.shots++;

  // Front-most (newest) exposed target under the crosshair wins.
  for (let i = s.targets.length - 1; i >= 0; i--) {
    const t = s.targets[i];
    if (t.hit || exposure(t, s.now) < 0.35) continue;
    const g = targetGeometry(t, s.now);
    if (!inRect(x, y, g.clip)) continue; // the wall hides whatever is below the sill
    const head = inCircle(x, y, g.head.x, g.head.y, HEAD_R);
    const body = !head && inRect(x, y, g.body);
    if (!head && !body) continue;

    t.hit = true;
    t.hitAt = s.now;
    if (t.kind === 'hostage') {
      s.score = Math.max(0, s.score - HOSTAGE_PENALTY);
      s.streak = 0;
      s.shake = 1;
      s.popups.push({ x, y, text: `-${HOSTAGE_PENALTY}`, kind: 'hostage', at: s.now });
      return 'hostage';
    }
    const points = hitPoints(head, s.streak);
    s.score += points;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.hits++;
    if (head) s.headshots++;
    s.shake = head ? 0.7 : 0.3;
    s.popups.push({ x, y, text: `+${points}`, kind: head ? 'head' : 'body', at: s.now });
    return head ? 'head' : 'body';
  }

  s.streak = 0;
  // Bullet holes only on the wall, not on the dark openings.
  if (!OPENINGS.some((o) => inRect(x, y, o))) {
    s.holes.push({ x, y });
    if (s.holes.length > 80) s.holes.shift();
  }
  return 'miss';
}

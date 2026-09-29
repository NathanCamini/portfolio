import type { GameState, Input, Phase, Side } from '../../components/volleyball/engine/types';
import type { RatingChange } from './elo';

/**
 * Wire protocol of the online beach-volley match (docs/volei-online.md).
 * Shared by the browser and the Worker, so both sides agree on every message
 * at compile time; the parsers below are the runtime check for whatever
 * actually arrives over the socket.
 *
 * JSON over WebSocket. Clients send intentions (held keys), never positions:
 * the Durable Object runs the physics and is the only source of truth.
 */

/** Bumped on any incompatible change; an old tab is told to reload. */
export const PROTOCOL_VERSION = 2;

export const NET = {
  /** One authoritative snapshot every 2 physics steps: 120 Hz / 2 = 60 per second. */
  SNAPSHOT_EVERY: 2,
  /** 3-2-1 before a match (and before resuming a paused one). */
  COUNTDOWN_MS: 3000,
  /** How long a dropped player's seat is held (the match stays paused meanwhile). */
  RECONNECT_GRACE_MS: 15_000,
  /** A socket that doesn't say hello by then is closed. */
  HELLO_TIMEOUT_MS: 5_000,
  /** Largest message a client may send (the biggest legit one, hello, is ~100 bytes). */
  MAX_MESSAGE_BYTES: 512,
  /** Inputs can be scheduled at most 1 s ahead of the server's clock. */
  MAX_INPUT_LEAD_TICKS: 120,
  /** Per-connection message budget: a token bucket refilled at 90/s, 180 deep. */
  RATE_PER_SECOND: 90,
  RATE_BURST: 180,
  /** A room nobody is connected to is deleted after this long. */
  ROOM_TTL_MS: 2 * 60 * 60 * 1000,
  PING_EVERY_MS: 2_000,
} as const;

// ---------------------------------------------------------------- room codes

/** No I, L, O, 0 or 1: codes are read aloud and typed from a phone. */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
const ROOM_CODE = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const isRoomCode = (value: string): boolean => ROOM_CODE.test(value);

/** Upper-cases and drops anything that can't be in a code, so "abc-23 " still works. */
export const normalizeRoomCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A random code: 31⁵ ≈ 28.6 million combinations. `random` returns [0, 1). */
export function newRoomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  return code;
}

// ---------------------------------------------------------------- inputs

/** Held keys packed into 3 bits: the only thing a player ever sends during a match. */
export const KEY = { LEFT: 1, RIGHT: 2, JUMP: 4 } as const;
const ALL_KEYS = KEY.LEFT | KEY.RIGHT | KEY.JUMP;

export const packInput = (i: Input) => (i.left ? KEY.LEFT : 0) | (i.right ? KEY.RIGHT : 0) | (i.jump ? KEY.JUMP : 0);

export const unpackInput = (bits: number): Input => ({
  left: (bits & KEY.LEFT) !== 0,
  right: (bits & KEY.RIGHT) !== 0,
  jump: (bits & KEY.JUMP) !== 0,
});

/** Swaps left and right: the right-hand player sees the court mirrored (docs: "Espelhamento"). */
export const mirrorBits = (bits: number) =>
  (bits & KEY.JUMP) | (bits & KEY.LEFT ? KEY.RIGHT : 0) | (bits & KEY.RIGHT ? KEY.LEFT : 0);

// ---------------------------------------------------------------- snapshots

/**
 * The authoritative state after `tick` physics steps. Positions are rounded
 * to 1/1000 px: small on the wire, and far below anything visible.
 */
export interface Snapshot {
  tick: number;
  /** [x, y, vx, vy] of the left player, the right player and the ball. */
  bodies: number[];
  score: [number, number];
  phase: Phase;
  phaseTime: number;
  matchTime: number;
  server: Side;
  lastScorer: Side | null;
  /** Keys each player is holding at `tick`: the client predicts the other one with them. */
  inputs: [number, number];
}

/** To 1/1000 (and never −0, so the binary snapshot below decodes to exactly the same numbers). */
const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

export function takeSnapshot(g: GameState, tick: number, inputs: [number, number]): Snapshot {
  const bodies: number[] = [];
  for (const b of [g.player, g.cpu, g.ball]) bodies.push(round(b.x), round(b.y), round(b.vx), round(b.vy));
  return {
    tick,
    bodies,
    score: [g.score[0], g.score[1]],
    phase: g.phase,
    phaseTime: round(g.phaseTime),
    matchTime: round(g.matchTime),
    server: g.server,
    lastScorer: g.lastScorer,
    inputs,
  };
}

/** Overwrites the simulated parts of `g` with a snapshot (decorations like stars are untouched). */
export function applySnapshot(g: GameState, s: Snapshot) {
  [g.player, g.cpu, g.ball].forEach((b, i) => {
    b.x = s.bodies[i * 4];
    b.y = s.bodies[i * 4 + 1];
    b.vx = s.bodies[i * 4 + 2];
    b.vy = s.bodies[i * 4 + 3];
  });
  g.score = [s.score[0], s.score[1]];
  g.phase = s.phase;
  g.phaseTime = s.phaseTime;
  g.matchTime = s.matchTime;
  g.server = s.server;
  g.lastScorer = s.lastScorer;
}

// ---------------------------------------------------------------- messages

export type RoomPhase = 'waiting' | 'countdown' | 'playing' | 'paused' | 'over';

export interface SeatView {
  name: string;
  connected: boolean;
  ready: boolean;
  /** Round trip the player reported, in ms (null until their first ping). */
  ping: number | null;
  /** Online rating, in rated rooms (quick match) once the server has looked it up. */
  rating: number | null;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  seats: [SeatView | null, SeatView | null];
  /** countdown: ms until the match (re)starts · paused: ms until the absent player forfeits. */
  remainingMs: number | null;
  /** A match is under way: running, paused, or counting down to resume after a pause. */
  live: boolean;
  /** Matches here count for the online ranking (rooms opened by the quick-match queue). */
  rated: boolean;
  /** Matches won in this room, per side (rematches add up). */
  wins: [number, number];
  /** The last finished match. */
  result: {
    winner: Side;
    score: [number, number];
    forfeit: boolean;
    /** Who played it (a player may have left the room since). */
    names: [string, string];
    /** It counts for the ranking: a rated room with two different players (browser and address). */
    counted: boolean;
    /** Rating before/after, once the server has saved the result; null until then, and for friendlies. */
    ratings: [RatingChange, RatingChange] | null;
  } | null;
}

export type ErrorCode =
  | 'bad_message'
  | 'bad_version'
  | 'invalid_name'
  | 'room_full'
  | 'room_not_found'
  | 'rate_limited'
  | 'replaced'
  | 'timeout'
  /** Quick match: the server couldn't open a room for the pair. */
  | 'unavailable';

export type ClientMessage =
  | { t: 'hello'; v: number; name: string; token?: string; pid?: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'input'; tick: number; bits: number }
  | { t: 'ping'; c: number; rtt?: number }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'welcome'; side: Side; token: string; room: RoomView }
  | { t: 'room'; room: RoomView }
  | { t: 'state'; s: Snapshot }
  /** The opponent changed keys, effective from `tick` (relayed the moment the server gets it). */
  | { t: 'opp'; tick: number; bits: number }
  | { t: 'pong'; c: number }
  | { t: 'error'; code: ErrorCode };

/** Tokens and player ids: 128 random bits as 32 lowercase hex characters. */
export const isHex32 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Strict parser for what a client sends: anything malformed, oversized or
 * with unexpected fields is `null`, and the room closes that socket.
 */
export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > NET.MAX_MESSAGE_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'hello':
      if (!isInt(o.v, 0, 1000) || typeof o.name !== 'string' || o.name.length > 64) return null;
      if (o.token !== undefined && !isHex32(o.token)) return null;
      if (o.pid !== undefined && !isHex32(o.pid)) return null;
      return {
        t: 'hello',
        v: o.v,
        name: o.name,
        ...(o.token ? { token: o.token as string } : {}),
        ...(o.pid ? { pid: o.pid as string } : {}),
      };
    case 'ready':
      return typeof o.ready === 'boolean' ? { t: 'ready', ready: o.ready } : null;
    case 'input':
      return isInt(o.tick, 0, 2 ** 31) && isInt(o.bits, 0, ALL_KEYS)
        ? { t: 'input', tick: o.tick, bits: o.bits }
        : null;
    case 'ping':
      if (typeof o.c !== 'number' || !Number.isFinite(o.c)) return null;
      return isInt(o.rtt, 0, 60_000) ? { t: 'ping', c: o.c, rtt: o.rtt } : { t: 'ping', c: o.c };
    case 'leave':
      return { t: 'leave' };
    default:
      return null;
  }
}

/** The browser trusts its own server; this only guards against a garbled frame. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (raw instanceof ArrayBuffer) {
    const s = decodeSnapshot(raw);
    return s ? { t: 'state', s } : null;
  }
  if (typeof raw !== 'string') return null;
  try {
    const m = JSON.parse(raw) as ServerMessage;
    return typeof m === 'object' && m !== null && typeof m.t === 'string' ? m : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- online ranking (HTTP)

/** A row of GET /api/volley/ratings: the top players by rating. */
export interface OnlineRankingEntry {
  name: string;
  rating: number;
  games: number;
  wins: number;
}

export interface OnlineRankingResponse {
  top: OnlineRankingEntry[];
  /** With `?me=<sha-256 of the player id>`: that player's standing (null if never rated). */
  me?: (OnlineRankingEntry & { position: number }) | null;
}

/** What goes over the socket: `state` as a binary frame (below), everything else as JSON text. */
export function encodeServerMessage(msg: ServerMessage): string | ArrayBuffer {
  return msg.t === 'state' ? encodeSnapshot(msg.s) : JSON.stringify(msg);
}

// ---------------------------------------------------------------- binary snapshot

/**
 * `state` messages travel as a binary frame (docs/volei-online.md, "Snapshot binário"):
 * 68 bytes instead of ~200 of JSON, 60 times a second. Every number in a
 * snapshot is already rounded to 1/1000, so storing it as an integer ×1000
 * and dividing back gives exactly the same double: the quantization rule
 * (server and clients bit-identical) still holds.
 *
 *   u8 kind (1) · u32 tick · 12 × i32 bodies ×1000 · u8 score[0] · u8 score[1] · u8 phase
 *   · i32 phaseTime ×1000 · i32 matchTime ×1000 · u8 server · u8 lastScorer (255 = none)
 *   · u8 inputs[0] · u8 inputs[1]
 */
const SNAPSHOT_KIND = 1;
const PHASES: Phase[] = ['title', 'serve', 'play', 'point', 'over'];
export const SNAPSHOT_BYTES = 1 + 4 + 12 * 4 + 3 + 4 + 4 + 2 + 2;

const milli = (n: number) => Math.round(n * 1000);

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const buf = new ArrayBuffer(SNAPSHOT_BYTES);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, SNAPSHOT_KIND);
  v.setUint32((o += 1), s.tick);
  o += 4;
  for (const n of s.bodies) {
    v.setInt32(o, milli(n));
    o += 4;
  }
  v.setUint8(o++, s.score[0]);
  v.setUint8(o++, s.score[1]);
  v.setUint8(o++, PHASES.indexOf(s.phase));
  v.setInt32(o, milli(s.phaseTime));
  v.setInt32((o += 4), milli(s.matchTime));
  o += 4;
  v.setUint8(o++, s.server);
  v.setUint8(o++, s.lastScorer ?? 255);
  v.setUint8(o++, s.inputs[0]);
  v.setUint8(o, s.inputs[1]);
  return buf;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot | null {
  if (buf.byteLength !== SNAPSHOT_BYTES) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== SNAPSHOT_KIND) return null;
  let o = 5;
  const bodies: number[] = [];
  for (let i = 0; i < 12; i++, o += 4) bodies.push(v.getInt32(o) / 1000 + 0);
  const score: [number, number] = [v.getUint8(o), v.getUint8(o + 1)];
  const phase = PHASES[v.getUint8(o + 2)];
  if (!phase) return null;
  o += 3;
  const phaseTime = v.getInt32(o) / 1000 + 0;
  const matchTime = v.getInt32(o + 4) / 1000 + 0;
  o += 8;
  const scorer = v.getUint8(o + 1);
  return {
    tick: v.getUint32(1),
    bodies,
    score,
    phase,
    phaseTime,
    matchTime,
    server: v.getUint8(o) as Side,
    lastScorer: scorer === 255 ? null : (scorer as Side),
    inputs: [v.getUint8(o + 2), v.getUint8(o + 3)],
  };
}

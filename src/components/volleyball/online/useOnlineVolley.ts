'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { rememberName } from '@/components/ranking/useRanking';
import type { GameStrings, OnlineErrorKey } from '@/i18n/types';
import { celebrate, originOf } from '@/lib/confetti';
import { readPalette } from '@/lib/palette';
import { mirrorState, Predictor, TickClock } from '@/lib/volley-online/predictor';
import {
  EMOTES,
  mirrorBits,
  NET,
  packInput,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
  type Snapshot,
} from '@/lib/volley-online/protocol';
import { createGame } from '../engine/physics';
import { renderGame, type View } from '../engine/render';
import type { Input, Side } from '../engine/types';
import { KEYMAP, type GameKey } from '../useVolleyballGame';
import { parseQueueServerMessage, type QueueClientMessage } from '@/lib/volley-online/queue';
import { SnapshotBuffer } from '@/lib/volley-online/spectator';
import { showRoomInUrl } from './link';
import { playerId } from './player';

/**
 * Browser side of the online match (docs/volei-online.md, "No navegador").
 *
 * - Quick match: a WebSocket to the queue's Durable Object until it pairs us,
 *   then the room it opened (joined ready; back to the queue if the opponent
 *   never shows up).
 * - One WebSocket to the room's Durable Object; if it drops mid-match the
 *   hook reconnects with the seat's token (kept per room in sessionStorage)
 *   while the server holds the seat and pauses the match.
 * - A requestAnimationFrame loop runs the prediction (Predictor.advanceTo up
 *   to TickClock's target tick), sends key changes, eases corrections out
 *   and draws. The right-hand player sees the court mirrored.
 * - React state only holds what the lobby UI shows (room, side, status,
 *   error, ping); everything per-frame lives in a ref.
 */

export type OnlineStatus = 'idle' | 'searching' | 'working' | 'online' | 'reconnecting';

/** Delays between reconnection attempts: ~16 s in total, a bit more than the seat is held. */
const RETRY_MS = [300, 700, 1500, 2500, 4000, 7000];

/** A reaction on screen. `side` is the room's side (0 = left seat). */
export interface Reaction {
  key: string;
  side: Side;
  id: number;
}

/** How long a reaction bubble stays up. */
const EMOTE_SHOWN_MS = 2_200;

/** Quick match: a room where the opponent hasn't shown up after this long goes back to the queue. */
const QUICK_JOIN_MS = 10_000;

const wsOrigin = () => location.origin.replace(/^http/, 'ws');

const tokenKey = (code: string) => `volley-online:${code}`;
const readToken = (code: string) => {
  try {
    return sessionStorage.getItem(tokenKey(code)) ?? undefined;
  } catch {
    return undefined;
  }
};
const writeToken = (code: string, token: string | null) => {
  try {
    if (token) sessionStorage.setItem(tokenKey(code), token);
    else sessionStorage.removeItem(tokenKey(code));
  } catch {
    /* private mode: a refresh just can't reclaim the seat */
  }
};

interface Net {
  ws: WebSocket | null;
  code: string | null;
  name: string;
  side: Side | null;
  room: RoomView | null;
  predictor: Predictor | null;
  /** The newest authoritative state (shown as is whenever the match isn't running). */
  last: Snapshot | null;
  clock: TickClock;
  keys: Input;
  retries: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  /** Bumped by every create/enter/leave: an answer to an older attempt is ignored. */
  attempt: number;
  /** No reconnecting: the player left, or the server refused us for good. */
  stopped: boolean;
  /** Spectating (a full room): no seat, no prediction, snapshots drawn one behind. */
  watch: boolean;
  spectate: SnapshotBuffer;
  /** When we last reacted (the server drops faster ones anyway). */
  lastEmote: number;
  /** Quick match: the socket to the queue while searching. */
  queue: WebSocket | null;
  /** The room came from the queue: ready right away, back to the queue if the opponent never shows. */
  quick: boolean;
  quickTimer: ReturnType<typeof setTimeout> | null;
}

interface Options {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  strings: GameStrings;
  /** The "you" label and nothing else is localised on the canvas; names come from the room. */
  youLabel: string;
}

export function useOnlineVolley({ canvasRef, stageRef, panelRef, strings, youLabel }: Options) {
  const [status, setStatus] = useState<OnlineStatus>('idle');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [error, setError] = useState<OnlineErrorKey | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  /** performance.now() when the room's countdown / reconnection window ends. */
  const [deadline, setDeadline] = useState<number | null>(null);
  /** Quick match: Date.now() when the search started, and whether the current room came from the queue. */
  const [searchingSince, setSearchingSince] = useState<number | null>(null);
  const [quickMatch, setQuickMatch] = useState(false);
  const [watching, setWatching] = useState(false);
  /** Reactions on screen right now (each lasts EMOTE_SHOWN_MS). */
  const [emotes, setEmotes] = useState<Reaction[]>([]);

  const net = useRef<Net>({
    ws: null,
    code: null,
    name: '',
    side: null,
    room: null,
    predictor: null,
    last: null,
    clock: new TickClock(),
    keys: { left: false, right: false, jump: false },
    retries: 0,
    retryTimer: null,
    attempt: 0,
    stopped: true,
    queue: null,
    quick: false,
    quickTimer: null,
    watch: false,
    spectate: new SnapshotBuffer(),
    lastEmote: -Infinity,
  });
  /** Quick-match room with no opponent: leave it and search again (set once the callbacks exist). */
  const requeue = useRef<() => void>(() => {});
  const labels = useRef({ strings, youLabel });
  useEffect(() => {
    labels.current = { strings, youLabel };
  }, [strings, youLabel]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = net.current.ws;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  /** Back to the start screen (optionally with an error to explain why). */
  const reset = useCallback((why: OnlineErrorKey | null) => {
    const n = net.current;
    n.stopped = true;
    n.attempt++;
    if (n.retryTimer) clearTimeout(n.retryTimer);
    if (n.quickTimer) clearTimeout(n.quickTimer);
    const ws = n.ws;
    const queue = n.queue;
    n.ws = null;
    n.queue = null;
    ws?.close(1000);
    queue?.close(1000);
    Object.assign(n, {
      code: null,
      side: null,
      room: null,
      predictor: null,
      last: null,
      retries: 0,
      retryTimer: null,
      quick: false,
      quickTimer: null,
      watch: false,
      spectate: new SnapshotBuffer(),
    });
    setSearchingSince(null);
    setQuickMatch(false);
    setWatching(false);
    setEmotes([]);
    setRoom(null);
    setSide(null);
    setPing(null);
    setDeadline(null);
    showRoomInUrl(null);
    setStatus('idle');
    setError(why);
  }, []);

  const showRoom = useCallback((room: RoomView) => {
    const n = net.current;
    n.room = room;
    setRoom(room);
    setDeadline(room.remainingMs === null ? null : performance.now() + room.remainingMs);
    // A stranger's room: if they never arrive (closed the tab while being matched), find someone else.
    const alone = n.quick && room.phase === 'waiting' && n.side !== null && !room.seats[n.side === 0 ? 1 : 0];
    if (alone && !n.quickTimer) {
      n.quickTimer = setTimeout(() => {
        n.quickTimer = null;
        requeue.current();
      }, QUICK_JOIN_MS);
    } else if (!alone && n.quickTimer) {
      clearTimeout(n.quickTimer);
      n.quickTimer = null;
    }
  }, []);

  const onMessage = useCallback(
    (m: ServerMessage) => {
      const n = net.current;
      switch (m.t) {
        case 'watching':
          n.watch = true;
          n.side = null;
          n.retries = 0;
          showRoomInUrl(n.code);
          showRoom(m.room);
          setSide(null);
          setWatching(true);
          setStatus('online');
          setError(null);
          break;
        case 'emote': {
          const key = `${m.side}-${performance.now()}`;
          setEmotes((list) => [...list.filter((r) => r.side !== m.side), { key, side: m.side, id: m.id }]);
          setTimeout(() => setEmotes((list) => list.filter((r) => r.key !== key)), EMOTE_SHOWN_MS);
          break;
        }
        case 'welcome': {
          n.side = m.side;
          n.retries = 0;
          n.predictor = new Predictor(m.side);
          n.last = null;
          n.clock.reset();
          writeToken(n.code!, m.token);
          showRoomInUrl(n.code); // a refresh comes back to this room (and seat)
          const seat = m.room.seats[m.side];
          if (seat) rememberName(seat.name); // the next room (and the ranking form) start with it
          showRoom(m.room);
          setSide(m.side);
          setStatus('online');
          setError(null);
          setSearchingSince(null);
          send({ t: 'ping', c: performance.now() });
          // Matched with a stranger: nothing to wait for, the countdown starts once both are in.
          if (n.quick && !m.room.live) send({ t: 'ready', ready: true });
          break;
        }
        case 'room': {
          const before = n.room;
          const phase = m.room.phase;
          if (phase === 'countdown' && !m.room.live && n.side !== null) {
            // A new match (not a resume): start predicting from scratch.
            n.predictor = new Predictor(n.side);
            n.last = null;
          }
          // The server's tick stood still during a pause/countdown: re-learn its clock.
          if (phase === 'playing' && before?.phase !== 'playing') n.clock.reset();
          // Stopped (paused, final whistle): show exactly where the server stopped, not our guess past it.
          if (phase !== 'playing' && before?.phase === 'playing' && n.last) n.predictor?.jumpTo(n.last);
          showRoom(m.room);
          if (phase === 'over' && before?.phase !== 'over' && m.room.result?.winner === n.side) {
            void celebrate(originOf(canvasRef.current), 1.2);
          }
          break;
        }
        case 'state':
          if (n.watch) {
            n.spectate.push(m.s, performance.now());
            break;
          }
          n.last = m.s;
          n.clock.observe(m.s.tick, performance.now());
          if (n.room?.phase === 'playing') n.predictor?.receive(m.s);
          else n.predictor?.jumpTo(m.s);
          break;
        case 'opp':
          // The opponent's key change, relayed at once: redo the prediction with it.
          n.predictor?.opponentInput(m.tick, m.bits);
          break;
        case 'pong': {
          const rtt = performance.now() - m.c;
          n.clock.observeRtt(rtt);
          setPing(Math.round(n.clock.rtt));
          break;
        }
        case 'error':
          // Every error closes the socket; none of them is fixed by retrying.
          if (m.code === 'replaced' || m.code === 'room_full') writeToken(n.code ?? '', null);
          reset(m.code);
          break;
      }
    },
    [canvasRef, reset, send, showRoom],
  );

  const connect = useCallback(
    (code: string) => {
      const n = net.current;
      const open = () => {
        const ws = new WebSocket(`${wsOrigin()}/api/volley/rooms/${code}`);
        ws.binaryType = 'arraybuffer'; // snapshots come as 68-byte binary frames
        n.ws = ws;
        ws.onopen = () => {
          if (n.ws !== ws) return;
          const token = readToken(code);
          const hello: ClientMessage = {
            t: 'hello',
            v: PROTOCOL_VERSION,
            name: n.name,
            pid: playerId(),
            ...(n.watch ? { watch: true as const } : token ? { token } : {}),
          };
          ws.send(JSON.stringify(hello));
        };
        ws.onmessage = (e) => {
          const m = parseServerMessage(e.data);
          if (m && n.ws === ws) onMessage(m);
        };
        ws.onclose = () => {
          if (n.ws !== ws || n.stopped) return;
          n.ws = null;
          // Dropped: try again while the server holds our seat.
          if (n.retries >= RETRY_MS.length) return reset('network');
          setStatus('reconnecting');
          n.retryTimer = setTimeout(open, RETRY_MS[n.retries++]);
        };
      };
      open();
    },
    [onMessage, reset],
  );

  /** Checks the room over plain HTTP first: a failed WebSocket handshake can't say why. */
  const enter = useCallback(
    async (code: string, name: string, attempt = ++net.current.attempt) => {
      const n = net.current;
      n.name = name;
      n.code = code;
      n.stopped = false;
      setStatus('working');
      setError(null);
      let why: OnlineErrorKey | null = null;
      try {
        const res = await fetch(`/api/volley/rooms/${code}`, { cache: 'no-store' });
        if (res.status === 404) why = 'room_not_found';
        else if (res.status === 503) why = 'unavailable';
        else if (!res.ok) why = 'network';
        else {
          const info = (await res.json()) as { players: number };
          // Full, and not our seat: watch instead.
          n.watch = info.players >= 2 && !readToken(code);
        }
      } catch {
        why = 'network';
      }
      if (attempt !== n.attempt) return; // left, or started over, meanwhile
      if (why) reset(why);
      else connect(code);
    },
    [connect, reset],
  );

  const create = useCallback(
    async (name: string) => {
      const attempt = ++net.current.attempt;
      setStatus('working');
      setError(null);
      let code: string | null = null;
      let why: OnlineErrorKey | null = null;
      try {
        const res = await fetch('/api/volley/rooms', { method: 'POST' });
        if (res.status === 429) why = 'rate_limited';
        else if (res.status === 503) why = 'unavailable';
        else if (!res.ok) why = 'network';
        else code = ((await res.json()) as { code: string }).code;
      } catch {
        why = 'network';
      }
      if (attempt !== net.current.attempt) return;
      if (code) await enter(code, name, attempt);
      else reset(why ?? 'network');
    },
    [enter, reset],
  );

  /** Quick match: wait in the queue until someone else joins, then go to the room it opens for both. */
  const quick = useCallback(
    async (name: string) => {
      const n = net.current;
      const attempt = ++n.attempt;
      n.name = name;
      n.stopped = false;
      n.quick = true;
      setStatus('searching');
      setError(null);
      setQuickMatch(true);
      setSearchingSince(Date.now());
      // Plain HTTP first: a refused WebSocket handshake can't say "rate limited" or "unavailable".
      let why: OnlineErrorKey | null = null;
      try {
        const res = await fetch('/api/volley/queue', { cache: 'no-store' });
        if (res.status === 429) why = 'rate_limited';
        else if (res.status === 503) why = 'unavailable';
        else if (!res.ok) why = 'network';
      } catch {
        why = 'network';
      }
      if (attempt !== n.attempt) return; // cancelled meanwhile
      if (why) return reset(why);

      const ws = new WebSocket(`${wsOrigin()}/api/volley/queue`);
      n.queue = ws;
      ws.onopen = () =>
        ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name, pid: playerId() } satisfies QueueClientMessage));
      ws.onmessage = (e) => {
        const m = parseQueueServerMessage(e.data);
        if (!m || n.queue !== ws) return;
        if (m.t === 'matched') {
          n.queue = null;
          ws.close(1000);
          void enter(m.code, name, attempt);
        } else if (m.t === 'error') reset(m.code);
      };
      ws.onclose = () => {
        if (n.queue === ws) reset('network');
      };
    },
    [enter, reset],
  );

  const setReady = useCallback((ready: boolean) => send({ t: 'ready', ready }), [send]);

  /** Stop searching (or connecting): back to the start screen. */
  const cancel = useCallback(() => reset(null), [reset]);

  const leave = useCallback(() => {
    send({ t: 'leave' });
    const code = net.current.code;
    if (code) writeToken(code, null);
    reset(null);
  }, [reset, send]);

  useEffect(() => {
    requeue.current = () => {
      const name = net.current.name;
      leave();
      void quick(name);
    };
  }, [leave, quick]);

  /** A quick reaction (players only); the server shows it to everyone in the room. */
  const emote = useCallback(
    (id: number) => {
      const n = net.current;
      const now = performance.now();
      if (n.watch || n.side === null || now - n.lastEmote < NET.EMOTE_COOLDOWN_MS) return;
      n.lastEmote = now;
      send({ t: 'emote', id });
    },
    [send],
  );
  const emoteRef = useRef(emote);
  useEffect(() => {
    emoteRef.current = emote;
  }, [emote]);

  const press = useCallback((k: GameKey) => void (net.current.keys[k] = true), []);
  const release = useCallback((k: GameKey) => void (net.current.keys[k] = false), []);

  // ---- ping every couple of seconds (round trip for the clock + shown to both players)
  useEffect(() => {
    const id = setInterval(() => {
      const n = net.current;
      send({ t: 'ping', c: performance.now(), ...(n.clock.rtt ? { rtt: Math.round(n.clock.rtt) } : {}) });
    }, NET.PING_EVERY_MS);
    return () => clearInterval(id);
  }, [send]);

  // ---- frame loop: predict, send key changes, draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !stage || !ctx) return;
    const palette = readPalette();
    const lobby = createGame('online'); // what's drawn before the first match
    const view: View = { w: 1, h: 1, dpr: 1 };
    const resize = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      Object.assign(view, { w: r.width, h: r.height, dpr });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      const n = net.current;
      if (n.watch) {
        // Spectators: no prediction, the court drawn one snapshot behind, left seat on the left.
        const seats = n.room?.seats;
        const names: [string, string] = [
          (seats?.[0]?.name ?? '—').toUpperCase(),
          (seats?.[1]?.name ?? '—').toUpperCase(),
        ];
        renderGame(ctx, n.spectate.view(now) ?? lobby, view, palette, labels.current.strings, names);
        return;
      }
      const p = n.predictor;
      if (p && n.room?.phase === 'playing' && n.clock.synced) {
        // Keys are pressed on screen directions; the right-hand player's court is mirrored.
        const screen = packInput(n.keys);
        const bits = n.side === 1 ? mirrorBits(screen) : screen;
        const tick = p.advanceTo(n.clock.target(now), bits);
        if (tick !== null) send({ t: 'input', tick, bits });
      }
      p?.smooth(dt);
      const g = p?.ready ? p.view() : lobby;
      const shown = n.side === 1 ? mirrorState(g) : g;
      const them = n.side === 1 ? 0 : 1;
      const rival = n.room?.seats[them]?.name ?? n.room?.result?.names[them] ?? '—';
      renderGame(ctx, shown, view, palette, labels.current.strings, [labels.current.youLabel, rival.toUpperCase()]);
    };
    raf = requestAnimationFrame(frame);

    const panelActive = () => {
      if (document.fullscreenElement) return true;
      const r = panelRef.current?.getBoundingClientRect();
      return !!r && r.bottom >= 80 && r.top <= window.innerHeight - 80;
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 1–6: a reaction (players, from the countdown to the result).
      const reaction = Number(e.key) - 1;
      if (down && !e.repeat && reaction >= 0 && reaction < EMOTES.length && panelActive()) {
        const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
        const phase = net.current.room?.phase;
        if (!typing && (phase === 'countdown' || phase === 'playing' || phase === 'over' || phase === 'paused')) {
          e.preventDefault();
          emoteRef.current(reaction);
          return;
        }
      }
      const k = KEYMAP[e.key];
      if (!k) return;
      if (!down) net.current.keys[k] = false; // a release always counts, or the key would stay "held" into the next match
      if (!panelActive()) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      // Lobby, pause, result: keys belong to the page. From the countdown on they're the player's (no page scroll).
      const phase = net.current.room?.phase;
      if (phase !== 'playing' && phase !== 'countdown') return;
      e.preventDefault();
      net.current.keys[k] = down;
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);
    const onBlur = () => Object.assign(net.current.keys, { left: false, right: false, jump: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [canvasRef, stageRef, panelRef, send]);

  // Leaving the online tab (or closing the panel) leaves the room.
  useEffect(() => {
    const n = net.current;
    return () => {
      if (n.ws?.readyState === WebSocket.OPEN) n.ws.send(JSON.stringify({ t: 'leave' } satisfies ClientMessage));
      n.stopped = true;
      n.attempt++;
      if (n.retryTimer) clearTimeout(n.retryTimer);
      if (n.quickTimer) clearTimeout(n.quickTimer);
      n.ws?.close(1000);
      n.ws = null;
      n.queue?.close(1000);
      n.queue = null;
      showRoomInUrl(null);
    };
  }, []);

  return {
    watching,
    emotes,
    emote,
    status,
    room,
    side,
    error,
    ping,
    deadline,
    quickMatch,
    searchingSince,
    create,
    enter,
    quick,
    cancel,
    setReady,
    leave,
    press,
    release,
  };
}

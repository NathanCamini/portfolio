'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { rememberedName, rememberName } from '@/components/ranking/useRanking';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { OnlineErrorKey, OnlineStrings } from '@/i18n/types';
import { useI18n } from '@/i18n/I18nProvider';
import { checkNickname, NAME_MAX, type NameProblem } from '@/lib/ranking/nickname';
import type { RatingChange } from '@/lib/volley-online/elo';
import {
  EMOTES,
  isRoomCode,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
  type LiveMatch,
  type LiveResponse,
  type OnlineRankingEntry,
  type OnlineRankingResponse,
  type RoomView,
} from '@/lib/volley-online/protocol';
import { Trophy } from '@/components/ui/icons';
import type { Side } from '../engine/types';
import { TouchPad } from '../TouchPad';
import panel from '../VolleyballGame.module.css';
import { roomLink } from './link';
import { playerHash } from './player';
import { useOnlineVolley } from './useOnlineVolley';
import styles from './OnlineVolley.module.css';

/** What the panel around needs to know: a card covers the court (taller stage on phones), a match is on. */
export interface OnlineChrome {
  overlay: boolean;
  inMatch: boolean;
}

interface Props {
  panelRef: RefObject<HTMLDivElement | null>;
  /** From a room link: prefilled, and joined right away when a nickname is remembered. */
  joinCode: string | null;
  onChrome: (chrome: OnlineChrome) => void;
}

/** The showcase refreshes this often while open (the start card's count, 3× slower). */
const LIVE_POLL_MS = 5_000;

const secondsIn = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

/** Whole seconds until `deadline` (performance.now() time), refreshed a few times a second. */
function useSecondsLeft(deadline: number | null, remainingMs: number | null) {
  const [tick, setTick] = useState<{ deadline: number; left: number } | null>(null);
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => {
      const left = secondsIn(deadline - performance.now());
      setTick((t) => (t?.deadline === deadline && t.left === left ? t : { deadline, left }));
    }, 100);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline === null || remainingMs === null) return null;
  return tick?.deadline === deadline ? tick.left : secondsIn(remainingMs);
}

/**
 * The online tab (docs/volei-online.md, "No navegador"): the court canvas plus
 * a card for each moment of a room: start (nickname; quick match, create or
 * join), searching the quick-match queue,
 * lobby (link to share, seats, ready), countdown, paused (the other player
 * dropped), reconnecting (we dropped) and the result with a rematch.
 * The connection and the netcode live in useOnlineVolley.
 */
export function OnlineVolley({ panelRef, joinCode, onChrome }: Props) {
  const { t } = useI18n();
  const vb = t.volleyball;
  const on = vb.online;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTouch = useMediaQuery('(pointer: coarse)');
  /** The start card's "Online ranking" view. */
  const [board, setBoard] = useState<'ranking' | 'live' | null>(null);
  /** The nickname being typed: kept here, so it survives a look at the ranking (the start card unmounts). */
  const [draftName, setDraftName] = useState(rememberedName);
  const {
    status,
    room,
    side,
    error,
    deadline,
    quickMatch,
    watching,
    emotes,
    emote,
    searchingSince,
    create,
    enter,
    quick,
    watch,
    cancel,
    setReady,
    leave,
    press,
    release,
  } = useOnlineVolley({
    canvasRef,
    stageRef,
    panelRef,
    strings: vb.game,
    youLabel: vb.game.you,
  });

  /** How many matches are on now, for the start card's "Live" button (polled while it shows). */
  const liveCount = useLiveCount(status === 'idle' && board === null);

  const phase = status === 'online' ? (room?.phase ?? null) : null;
  const card = status !== 'online' || phase === 'waiting' || phase === 'paused' || phase === 'over';
  const tall =
    status === 'idle' || status === 'searching' || status === 'working' || phase === 'waiting' || phase === 'over';
  const searching = status === 'searching' || (status === 'working' && quickMatch);
  // A spectator can leave any time; a player mid-match would forfeit, so the tabs lock for them.
  const inMatch = !watching && (status === 'reconnecting' || !!room?.live);

  useEffect(() => onChrome({ overlay: tall, inMatch }), [tall, inMatch, onChrome]);
  useEffect(() => () => onChrome({ overlay: false, inMatch: false }), [onChrome]);

  // A room link: go straight in when we already know the player's nickname.
  useEffect(() => {
    if (!joinCode) return;
    const nick = checkNickname(rememberedName());
    if (nick.ok) void enter(joinCode, nick.name);
  }, [joinCode, enter]);

  // The match is about to start: keys go to the court (the button that was focused is gone).
  useEffect(() => {
    if (phase === 'countdown') canvasRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const seconds = useSecondsLeft(deadline, room?.remainingMs ?? null);
  const me: Side = side ?? 0;
  const rival = room?.seats[me === 0 ? 1 : 0] ?? null;
  const rivalName = rival?.name ?? '—';

  let overlay: ReactNode = null;
  if (searching) {
    overlay = (
      <Card>
        <Searching since={searchingSince} on={on} onCancel={cancel} />
      </Card>
    );
  } else if (status === 'idle' && board === 'ranking') {
    overlay = (
      <Card>
        <Board on={on} onBack={() => setBoard(null)} />
      </Card>
    );
  } else if (status === 'idle' && board === 'live') {
    overlay = (
      <Card>
        <LiveBoard
          on={on}
          onBack={() => setBoard(null)}
          onWatch={(code) => {
            setBoard(null);
            void watch(code);
          }}
        />
      </Card>
    );
  } else if (status === 'idle' || status === 'working') {
    overlay = (
      <Card>
        <StartCard
          onRanking={() => setBoard('ranking')}
          onLive={() => setBoard('live')}
          liveCount={liveCount}
          name={draftName}
          setName={setDraftName}
          on={on}
          nameErrors={t.ranking.errors}
          busy={status === 'working'}
          error={error ? on.errors[error] : null}
          initialCode={joinCode ?? ''}
          onCreate={create}
          onQuick={quick}
          onJoin={enter}
        />
      </Card>
    );
  } else if (status === 'reconnecting') {
    overlay = (
      <Card>
        <p className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {on.reconnecting}
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={leave}>
            {on.leave}
          </button>
        </div>
      </Card>
    );
  } else if (watching && room && card) {
    overlay = (
      <Card>
        <WatchCard room={room} on={on} seconds={seconds} />
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={leave}>
            {on.leave}
          </button>
        </div>
      </Card>
    );
  } else if (room && phase === 'waiting') {
    overlay = (
      <Card>
        <RoomHeader code={room.code} on={on} kicker={quickMatch ? on.found : undefined} />
        <p className={`${styles.badge} ${room.rated ? styles.rated : ''}`}>{room.rated ? on.rated : on.friendly}</p>
        {/* A stranger's room from the queue isn't one to share. */}
        {!quickMatch && <ShareLink code={room.code} on={on} />}
        <Seats room={room} side={me} on={on} />
        <Ready room={room} side={me} on={on} label={on.ready} setReady={setReady} leave={leave} />
      </Card>
    );
  } else if (room && phase === 'paused') {
    overlay = (
      <Card>
        <p className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {on.paused.replace('{name}', rivalName)}
        </p>
        {seconds !== null && <p className={styles.sub}>{on.pausedHint.replace('{n}', String(seconds))}</p>}
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={leave}>
            {on.leave}
          </button>
        </div>
      </Card>
    );
  } else if (room && phase === 'over' && room.result) {
    const { winner, score, forfeit, names } = room.result;
    const them: Side = me === 0 ? 1 : 0;
    const won = winner === me;
    overlay = (
      <Card>
        <header className={styles.result}>
          <p className={styles.kicker}>
            {forfeit ? `${on.room} ${room.code} · ${on.byForfeit}` : `${on.room} ${room.code}`}
          </p>
          <p className={`${styles.headline} ${won ? styles.win : ''}`}>
            {won ? on.won : on.lost.replace('{name}', names[winner])}
          </p>
          <p className={styles.scoreline}>
            {score[me]} <span className={styles.times}>×</span> {score[them]}
          </p>
          <p className={styles.sub}>
            {on.series}: {room.wins[me]} × {room.wins[them]}
          </p>
          {room.result.ratings ? (
            <RatingLine change={room.result.ratings[me]} on={on} />
          ) : !room.rated ? (
            <p className={styles.sub}>{on.friendly}</p>
          ) : (
            !room.result.counted && <p className={styles.sub}>{on.notCounted}</p>
          )}
        </header>
        <Seats room={room} side={me} on={on} />
        <Ready room={room} side={me} on={on} label={on.again} setReady={setReady} leave={leave} />
      </Card>
    );
  } else if (room && phase === 'over') {
    // Over without a result can't happen; show the lobby rather than nothing.
    overlay = (
      <Card>
        <RoomHeader code={room.code} on={on} />
        <Seats room={room} side={me} on={on} />
        <Ready room={room} side={me} on={on} label={on.ready} setReady={setReady} leave={leave} />
      </Card>
    );
  }

  const showReactions = !watching && !!room && phase !== 'waiting' && phase !== null;
  const reactionBar = (
    <div className={`${styles.emoteBar} ${isTouch ? styles.emoteRow : ''}`} role="group" aria-label={on.reactions}>
      {EMOTES.map((e, i) => (
        <button
          key={e}
          type="button"
          className={styles.emoteBtn}
          onClick={() => emote(i)}
          title={`${on.reactions}: ${i + 1}`}
          aria-label={`${e} (${i + 1})`}
        >
          {e}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div ref={stageRef} className={panel.stage}>
        <canvas
          ref={canvasRef}
          className={`${panel.canvas} ${styles.canvas}`}
          tabIndex={0}
          role="img"
          aria-label={`${vb.canvasLabel}. ${vb.controls}`}
        />
        {card && overlay && <div className={styles.overlay}>{overlay}</div>}
        {phase === 'countdown' && seconds !== null && (
          <div className={styles.countdown} role="status">
            <span className={styles.countLabel}>{room?.live ? on.resumesIn : on.startsIn}</span>
            <span key={seconds} className={styles.countNum}>
              {Math.max(1, seconds)}
            </span>
          </div>
        )}
        {(phase === 'playing' || phase === 'countdown') && room && (
          <div className={styles.hud}>
            {watching ? (
              <span>
                {on.watching} · {on.room} {room.code}
              </span>
            ) : (
              <>
                <Signal ping={room.seats[me]?.ping ?? null} label={on.you} on={on} />
                <Signal ping={rival?.ping ?? null} label={rivalName} on={on} />
              </>
            )}
            {room.spectators > 0 && (
              <span title={on.spectators.replace('{n}', String(room.spectators))}>👁 {room.spectators}</span>
            )}
          </div>
        )}
        {/* Reactions: players, from the countdown on (keys 1–6). Over the court on desktop, under it on touch screens. */}
        {showReactions && !isTouch && reactionBar}
        {emotes.map((r) => {
          // The left of the screen is the left seat for a spectator, and always "you" for a player.
          const left = watching ? r.side === 0 : r.side === me;
          return (
            <span
              key={r.key}
              className={`${styles.bubble} ${left ? styles.bubbleLeft : styles.bubbleRight}`}
              aria-hidden="true"
            >
              {EMOTES[r.id]}
            </span>
          );
        })}
      </div>

      {showReactions && isTouch && reactionBar}
      {isTouch && <TouchPad labels={vb} press={press} release={release} />}
    </>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}

function RoomHeader({ code, on, kicker }: { code: string; on: OnlineStrings; kicker?: string }) {
  return (
    <header className={styles.roomHead}>
      <p className={styles.kicker}>{kicker ?? on.room}</p>
      <p className={styles.code}>{code}</p>
    </header>
  );
}

/** In the quick-match queue: how long we've been waiting, and a way out. */
function Searching({ since, on, onCancel }: { since: number | null; on: OnlineStrings; onCancel: () => void }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const seconds = since === null || now === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <>
      <p className={styles.status} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        {on.searching}
      </p>
      <p className={styles.elapsed} aria-hidden="true">
        {elapsed}
      </p>
      <p className={styles.sub}>{on.searchingHint}</p>
      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {on.cancel}
        </button>
      </div>
    </>
  );
}

function ShareLink({ code, on }: { code: string; on: OnlineStrings }) {
  const inputId = useId();
  const [copied, setCopied] = useState(false);
  const link = roomLink(location.origin, code);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // No clipboard permission: select the link so it can be copied by hand.
      (document.getElementById(inputId) as HTMLInputElement | null)?.select();
    }
  };

  return (
    <div className={styles.share}>
      <label className={styles.label} htmlFor={inputId}>
        {on.share}
      </label>
      <div className={styles.row}>
        <input
          id={inputId}
          className={`${styles.input} ${styles.link}`}
          value={link}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="btn btn-secondary" onClick={() => void copy()} aria-live="polite">
          {copied ? on.copied : on.copy}
        </button>
      </div>
    </div>
  );
}

/** Both seats, the player's first: name, ready / dropped, round trip. */
/** Connection quality from the round trip a player reported: three bars, like a phone. */
function Signal({ ping, label, on }: { ping: number | null; label: string; on: OnlineStrings }) {
  const level = ping === null ? 0 : ping < 80 ? 3 : ping < 160 ? 2 : 1;
  const text = ping === null ? '…' : `${ping} ms`;
  return (
    <span className={`${styles.signal} ${styles[`q${level}`]}`} title={`${label}: ${on.ping} ${text}`}>
      <span className={styles.bars} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className={styles.signalName}>{label}</span> {text}
    </span>
  );
}

/** What a spectator sees between rallies: who's playing, and what's going on. */
function WatchCard({ room, on, seconds }: { room: RoomView; on: OnlineStrings; seconds: number | null }) {
  const [a, b] = room.seats;
  const dropped = room.seats.find((s) => s && !s.connected);
  return (
    <>
      <header className={styles.roomHead}>
        <p className={styles.kicker}>
          {on.watching} · {on.room} {room.code}
        </p>
        {room.result && room.phase === 'over' ? (
          <>
            <p className={styles.headline}>{on.lost.replace('{name}', room.result.names[room.result.winner])}</p>
            <p className={styles.scoreline}>
              {room.result.score[0]} <span className={styles.times}>×</span> {room.result.score[1]}
            </p>
            <p className={styles.sub}>
              {on.series}: {room.wins[0]} × {room.wins[1]}
            </p>
          </>
        ) : (
          <p className={styles.headline}>
            {a?.name ?? '—'} <span className={styles.times}>×</span> {b?.name ?? '—'}
          </p>
        )}
      </header>
      {room.phase === 'paused' && dropped && (
        <p className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {on.paused.replace('{name}', dropped.name)}
        </p>
      )}
      {room.phase === 'paused' && seconds !== null && (
        <p className={styles.sub}>{on.pausedWatch.replace('{n}', String(seconds))}</p>
      )}
      {room.phase === 'waiting' && <p className={styles.sub}>{on.watchingHint}</p>}
      <Seats room={room} side={null} on={on} />
    </>
  );
}

function Seats({ room, side, on }: { room: RoomView; side: Side | null; on: OnlineStrings }) {
  const order: Side[] = side === 1 ? [1, 0] : [0, 1];
  return (
    <ul className={styles.seats}>
      {order.map((i) => {
        const seat = room.seats[i];
        return (
          <li key={i} className={i === side ? styles.mine : undefined}>
            <span className={`${styles.dot} ${seat?.connected ? styles.online : ''}`} aria-hidden="true" />
            {seat ? (
              <span className={styles.name}>
                {seat.name}
                {i === side && <span className={styles.you}> · {on.you}</span>}
                {seat.rating !== null && <span className={styles.rating}> · {seat.rating}</span>}
              </span>
            ) : (
              <span className={styles.empty}>{on.waitingSeat}</span>
            )}
            <span className={styles.tags}>
              {seat && !seat.connected && <span className={styles.off}>{on.offline}</span>}
              {seat?.connected && seat.ready && <span className={styles.ready}>{on.readyTag}</span>}
              {seat?.connected && seat.ping !== null && <span className={styles.ping}>{seat.ping} ms</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Ready" toggle (a rematch after a match) and "leave"; the line above says who we're waiting for. */
function Ready({
  room,
  side,
  on,
  label,
  setReady,
  leave,
}: {
  room: RoomView;
  side: Side;
  on: OnlineStrings;
  label: string;
  setReady: (ready: boolean) => void;
  leave: () => void;
}) {
  const mine = room.seats[side];
  const rival = room.seats[side === 0 ? 1 : 0];
  const ready = !!mine?.ready;
  // (An empty seat already says so in the list.)
  const note = rival && ready && !rival.ready ? on.waitingOther.replace('{name}', rival.name) : '';
  return (
    <>
      <p className={styles.note} aria-live="polite">
        {note}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={`btn ${ready ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => setReady(!ready)}
          aria-pressed={ready}
        >
          {ready ? on.unready : label}
        </button>
        <button type="button" className="btn btn-secondary" onClick={leave}>
          {on.leave}
        </button>
      </div>
    </>
  );
}

/** "Rating: 1016 (+16)" after a rated match. */
function RatingLine({ change, on }: { change: RatingChange; on: OnlineStrings }) {
  const delta = change.after - change.before;
  return (
    <p className={`${styles.ratingLine} ${delta >= 0 ? styles.up : styles.down}`}>
      {on.ratingChange.replace('{after}', String(change.after)).replace('{delta}', `${delta >= 0 ? '+' : ''}${delta}`)}
    </p>
  );
}

type BoardState =
  { kind: 'loading' } | { kind: 'error'; error: OnlineErrorKey } | { kind: 'ready'; data: OnlineRankingResponse };

/** Polls GET /api/volley/live while `active`; null until the first answer (or if online is unavailable). */
function useLiveCount(active: boolean) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const load = async () => {
      try {
        const res = await fetch('/api/volley/live', { cache: 'no-store' });
        if (!res.ok) return;
        const { matches } = (await res.json()) as LiveResponse;
        if (live) setCount(matches.length);
      } catch {
        /* offline: the button simply shows no count */
      }
    };
    void load();
    const id = setInterval(load, LIVE_POLL_MS * 3);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [active]);
  return count;
}

/** The live showcase: the quick matches on now, refreshed every few seconds, one click to watch. */
function LiveBoard({
  on,
  onBack,
  onWatch,
}: {
  on: OnlineStrings;
  onBack: () => void;
  onWatch: (code: string) => void;
}) {
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);
  const [failed, setFailed] = useState<OnlineErrorKey | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
    let live = true;
    const load = async () => {
      try {
        const res = await fetch('/api/volley/live', { cache: 'no-store' });
        if (!live) return;
        if (!res.ok) return setFailed(res.status === 503 ? 'unavailable' : 'network');
        const data = (await res.json()) as LiveResponse;
        if (live) {
          setMatches(data.matches);
          setFailed(null);
        }
      } catch {
        if (live) setFailed('network');
      }
    };
    void load();
    const id = setInterval(load, LIVE_POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className={styles.boardCard}>
      <header>
        <h3 className={styles.title}>{on.liveTitle}</h3>
        <p className={styles.sub}>{on.liveHelp}</p>
      </header>
      {failed && <p className={styles.error}>{on.errors[failed]}</p>}
      {!failed && matches === null && (
        <p className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
        </p>
      )}
      {matches?.length === 0 && <p className={styles.note}>{on.liveEmpty}</p>}
      {matches && matches.length > 0 && (
        <ul className={styles.liveList}>
          {matches.map((m) => (
            <li key={m.code}>
              <span className={styles.liveNames}>
                <span className={styles.name}>{m.names[0]}</span>
                <span className={styles.liveScore}>
                  {m.score[0]} <span className={styles.times}>×</span> {m.score[1]}
                </span>
                <span className={styles.name}>{m.names[1]}</span>
              </span>
              <span className={styles.tags}>
                {m.phase === 'paused' && <span className={styles.off}>{on.livePaused}</span>}
                {m.spectators > 0 && <span className={styles.ping}>👁 {m.spectators}</span>}
              </span>
              <button type="button" className={`btn btn-primary ${styles.small}`} onClick={() => onWatch(m.code)}>
                {on.watch}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button ref={backRef} type="button" className="btn btn-secondary" onClick={onBack}>
          {on.back}
        </button>
      </div>
    </div>
  );
}

/** The online ranking: top 10 by rating, and where this browser's player stands. */
function Board({ on, onBack }: { on: OnlineStrings; onBack: () => void }) {
  const [state, setState] = useState<BoardState>({ kind: 'loading' });
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/volley/ratings?me=${await playerHash()}`, { cache: 'no-store' });
        if (!live) return;
        if (!res.ok) return setState({ kind: 'error', error: res.status === 503 ? 'unavailable' : 'network' });
        const data = (await res.json()) as OnlineRankingResponse;
        if (live) setState({ kind: 'ready', data });
      } catch {
        if (live) setState({ kind: 'error', error: 'network' });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const me = state.kind === 'ready' ? state.data.me : null;
  const record = (e: OnlineRankingEntry) =>
    on.record.replace('{wins}', String(e.wins)).replace('{games}', String(e.games));

  return (
    <div className={styles.boardCard}>
      <header>
        <h3 className={styles.title}>{on.ranking}</h3>
        <p className={styles.sub}>{on.rankingHelp}</p>
      </header>
      {state.kind === 'loading' && (
        <p className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
        </p>
      )}
      {state.kind === 'error' && <p className={styles.error}>{on.errors[state.error]}</p>}
      {state.kind === 'ready' &&
        (state.data.top.length === 0 ? (
          <p className={styles.note}>{on.rankingEmpty}</p>
        ) : (
          <ol className={styles.board}>
            {state.data.top.map((e, i) => (
              <li key={`${i}-${e.name}`} className={me && me.position === i + 1 ? styles.mine : undefined}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.name}>{e.name}</span>
                <span className={styles.line}>{record(e)}</span>
                <span className={styles.score}>{e.rating}</span>
              </li>
            ))}
          </ol>
        ))}
      {me && me.position > (state.kind === 'ready' ? state.data.top.length : 0) && (
        <p className={styles.meRow}>
          {on.position.replace('{n}', String(me.position))} · {me.name} · {me.rating} · {record(me)}
        </p>
      )}
      <div className={styles.actions}>
        <button ref={backRef} type="button" className="btn btn-secondary" onClick={onBack}>
          {on.back}
        </button>
      </div>
    </div>
  );
}

function StartCard({
  onRanking,
  onLive,
  liveCount,
  name,
  setName,
  on,
  nameErrors,
  busy,
  error,
  initialCode,
  onCreate,
  onQuick,
  onJoin,
}: {
  on: OnlineStrings;
  nameErrors: Record<NameProblem, string>;
  busy: boolean;
  error: string | null;
  initialCode: string;
  onCreate: (name: string) => void;
  onQuick: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onRanking: () => void;
  onLive: () => void;
  liveCount: number | null;
  name: string;
  setName: (name: string) => void;
}) {
  const titleId = useId();
  const nameId = useId();
  const codeId = useId();
  const errorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(initialCode);
  const [problem, setProblem] = useState<NameProblem | 'code' | null>(null);

  // Start on the nickname, without scrolling the page.
  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
  }, []);

  /** The same nickname rules as the server (it checks again), with instant feedback. */
  const nickname = () => {
    const nick = checkNickname(name);
    if (!nick.ok) {
      setProblem(nick.reason);
      nameRef.current?.focus({ preventScroll: true });
      return null;
    }
    setProblem(null);
    rememberName(nick.name); // cancelling (or an error) brings this card back: keep what they typed
    return nick.name;
  };

  const createRoom = () => {
    const nick = nickname();
    if (nick) onCreate(nick);
  };

  const quickMatch = () => {
    const nick = nickname();
    if (nick) onQuick(nick);
  };

  // Enter anywhere in the form: join when there's a code, otherwise a quick match.
  // (The name field handles its own Enter: with no code the form's only submit button,
  // Join, is disabled, and a disabled default button blocks implicit submission.)
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code) return quickMatch();
    const nick = nickname();
    if (!nick) return;
    const normalized = normalizeRoomCode(code);
    if (!isRoomCode(normalized)) return setProblem('code');
    onJoin(normalized, nick);
  };

  const message =
    problem === 'code' ? on.errors.room_not_found : problem ? nameErrors[problem] : (error ?? (busy ? on.working : ''));

  return (
    <form className={styles.start} onSubmit={submit} noValidate aria-labelledby={titleId} aria-busy={busy}>
      <header>
        <div className={styles.titleRow}>
          <h3 id={titleId} className={styles.title}>
            {on.title}
          </h3>
          <div className={styles.titleActions}>
            <button type="button" className={`btn btn-secondary ${styles.small}`} onClick={onLive} disabled={busy}>
              <span className={`${styles.liveDot} ${liveCount ? styles.liveOn : ''}`} aria-hidden="true" />
              {on.live}
              {liveCount ? <span className={styles.liveCount}>{liveCount}</span> : null}
            </button>
            <button type="button" className={`btn btn-secondary ${styles.small}`} onClick={onRanking} disabled={busy}>
              <Trophy size={13} />
              {on.ranking}
            </button>
          </div>
        </div>
        <p className={styles.sub}>{on.intro}</p>
      </header>

      <label className={styles.label} htmlFor={nameId}>
        {on.nameLabel}
      </label>
      <input
        ref={nameRef}
        id={nameId}
        className={styles.input}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (problem && problem !== 'code') setProblem(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !code) submit(e);
        }}
        placeholder={on.namePlaceholder}
        maxLength={NAME_MAX + 8}
        autoComplete="nickname"
        spellCheck={false}
        disabled={busy}
        aria-invalid={!!problem && problem !== 'code'}
        aria-describedby={errorId}
      />
      {/* Arrived with a room link: joining it is the main action, not a stranger or another room. */}
      <div className={styles.actions}>
        <button
          type="button"
          className={`btn ${initialCode ? 'btn-secondary' : 'btn-primary'}`}
          onClick={quickMatch}
          disabled={busy}
        >
          {on.quick}
        </button>
        <button type="button" className="btn btn-secondary" onClick={createRoom} disabled={busy}>
          {on.create}
        </button>
      </div>

      <p className={styles.divider}>
        <span>{on.or}</span>
      </p>

      <label className={styles.label} htmlFor={codeId}>
        {on.codeLabel}
      </label>
      <div className={styles.row}>
        <input
          id={codeId}
          className={`${styles.input} ${styles.codeInput}`}
          value={code}
          onChange={(e) => {
            setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH));
            if (problem === 'code') setProblem(null);
          }}
          placeholder="ABC23"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          disabled={busy}
          aria-invalid={problem === 'code'}
          aria-describedby={errorId}
        />
        <button
          type="submit"
          className={`btn ${initialCode ? 'btn-primary' : 'btn-secondary'}`}
          disabled={busy || !code}
        >
          {on.join}
        </button>
      </div>

      <p id={errorId} className={error || problem ? styles.error : styles.note} role="status">
        {message}
      </p>
    </form>
  );
}

'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { rememberedName } from '@/components/ranking/useRanking';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { OnlineStrings } from '@/i18n/types';
import { useI18n } from '@/i18n/I18nProvider';
import { checkNickname, NAME_MAX, type NameProblem } from '@/lib/ranking/nickname';
import { isRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH, type RoomView } from '@/lib/volley-online/protocol';
import type { Side } from '../engine/types';
import { TouchPad } from '../TouchPad';
import panel from '../VolleyballGame.module.css';
import { roomLink } from './link';
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
 * a card for each moment of a room: start (nickname, create or join),
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
  const { status, room, side, error, deadline, create, enter, setReady, leave, press, release } = useOnlineVolley({
    canvasRef,
    stageRef,
    panelRef,
    strings: vb.game,
    youLabel: vb.game.you,
  });

  const phase = status === 'online' ? (room?.phase ?? null) : null;
  const card = status !== 'online' || phase === 'waiting' || phase === 'paused' || phase === 'over';
  const tall = status === 'idle' || status === 'working' || phase === 'waiting' || phase === 'over';
  const inMatch = status === 'reconnecting' || !!room?.live;

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
  if (status === 'idle' || status === 'working') {
    overlay = (
      <Card>
        <StartCard
          on={on}
          nameErrors={t.ranking.errors}
          busy={status === 'working'}
          error={error ? on.errors[error] : null}
          initialCode={joinCode ?? ''}
          onCreate={create}
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
  } else if (room && phase === 'waiting') {
    overlay = (
      <Card>
        <RoomHeader code={room.code} on={on} />
        <ShareLink code={room.code} on={on} />
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
          <p className={styles.hud} aria-hidden="true">
            {on.room} {room.code}
            {room.seats[me]?.ping != null && ` · ${on.ping} ${room.seats[me]!.ping} ms`}
          </p>
        )}
      </div>

      {isTouch && <TouchPad labels={vb} press={press} release={release} />}
    </>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}

function RoomHeader({ code, on }: { code: string; on: OnlineStrings }) {
  return (
    <header className={styles.roomHead}>
      <p className={styles.kicker}>{on.room}</p>
      <p className={styles.code}>{code}</p>
    </header>
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
function Seats({ room, side, on }: { room: RoomView; side: Side; on: OnlineStrings }) {
  const order: Side[] = side === 0 ? [0, 1] : [1, 0];
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

function StartCard({
  on,
  nameErrors,
  busy,
  error,
  initialCode,
  onCreate,
  onJoin,
}: {
  on: OnlineStrings;
  nameErrors: Record<NameProblem, string>;
  busy: boolean;
  error: string | null;
  initialCode: string;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
}) {
  const titleId = useId();
  const nameId = useId();
  const codeId = useId();
  const errorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(rememberedName);
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
    return nick.name;
  };

  const createRoom = () => {
    const nick = nickname();
    if (nick) onCreate(nick);
  };

  // Enter anywhere in the form: join when there's a code, otherwise create a room.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code) return createRoom();
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
        <h3 id={titleId} className={styles.title}>
          {on.title}
        </h3>
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
        placeholder={on.namePlaceholder}
        maxLength={NAME_MAX + 8}
        autoComplete="nickname"
        spellCheck={false}
        disabled={busy}
        aria-invalid={!!problem && problem !== 'code'}
        aria-describedby={errorId}
      />
      {/* Arrived with a room link: joining it is the main action, not creating another. */}
      <button
        type="button"
        className={`btn ${initialCode ? 'btn-secondary' : 'btn-primary'}`}
        onClick={createRoom}
        disabled={busy}
      >
        {on.create}
      </button>

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

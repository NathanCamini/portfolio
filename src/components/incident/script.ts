import { DELETE_QUERY } from '@/lib/incident';

/**
 * The psql session shown after the DELETE sticker wipes the page — pure data
 * and pure functions, no DOM, so the whole sequence is unit-tested.
 *
 * `buildScript` writes the session, `compile` turns it into absolute times and
 * `frameAt(timeline, t)` says exactly what is on screen `t` ms after the click:
 * the component only has to advance a clock.
 */

export type Tone = 'plain' | 'dim' | 'comment' | 'danger' | 'error' | 'hint' | 'ok';

export interface ScriptLine {
  /** psql prompt (`portfolio=*# `): shown at once, then `text` is typed after it. */
  prompt?: string;
  text: string;
  tone: Tone;
  /** Pause after the previous line finished, before this one appears (ms). */
  wait?: number;
  /** Prompt lines: time spent "thinking" with the cursor blinking before typing (ms). */
  think?: number;
  /** Typing speed; 0 prints the whole line at once. */
  charMs?: number;
  /** Appended once the line is complete (the green "ok" of a restore line). */
  suffix?: { text: string; tone: Tone };
  /** Index of the page row this line brings back, the moment it completes. */
  restores?: number;
}

/** Localised prose; the SQL itself is the same in every language. */
export interface IncidentCopy {
  hint: string;
  lost: string;
  relief: string;
  lesson: string;
}

// psql's default prompt: `*` inside a transaction, `!` once the transaction has failed.
export const PROMPT = {
  idle: 'portfolio=# ',
  tx: 'portfolio=*# ',
  failed: 'portfolio=!# ',
} as const;

/**
 * The session: the sticker's query as it was really run (replayed quickly),
 * the errors it caused, a failed attempt to look at the damage, and the
 * ROLLBACK that restores `rows` — the labels of the page blocks that vanished —
 * one line (and one block) at a time.
 */
export function buildScript(copy: IncidentCopy, rows: string[]): ScriptLine[] {
  // psql splits the line at `;`: the DELETE runs alone, then "WHERE …" is a statement of its own.
  const orphan = `${DELETE_QUERY.slice(DELETE_QUERY.indexOf(';') + 1).trim()};`;
  const token = orphan.split(' ')[0];
  const count = 'SELECT count(*) FROM users;';
  const width = Math.max(26, ...rows.map((r) => r.length + 6));

  return [
    // Replay of what the click just did.
    { prompt: PROMPT.idle, text: 'BEGIN;', tone: 'plain', wait: 120 },
    { text: 'BEGIN', tone: 'dim', wait: 70 },
    { prompt: PROMPT.tx, text: `${DELETE_QUERY};`, tone: 'plain', wait: 110, charMs: 7 },
    { text: `DELETE ${rows.length}`, tone: 'danger', wait: 160 },
    { text: `ERROR:  syntax error at or near "${token}" 🫢`, tone: 'error', wait: 220 },
    { text: `LINE 1: ${orphan}`, tone: 'plain', wait: 30 },
    { text: `${' '.repeat('LINE 1: '.length)}^`, tone: 'error', wait: 30 },
    { text: `HINT:  ${copy.hint}`, tone: 'hint', wait: 100 },

    // Live: looking for the site inside an aborted transaction.
    { prompt: PROMPT.failed, text: `-- ${copy.lost}`, tone: 'comment', think: 800, charMs: 36 },
    { prompt: PROMPT.failed, text: count, tone: 'plain', wait: 300, think: 150, charMs: 24 },
    {
      text: 'ERROR:  current transaction is aborted, commands ignored until end of transaction block',
      tone: 'error',
      wait: 220,
    },
    { prompt: PROMPT.failed, text: `-- ${copy.relief}`, tone: 'comment', think: 900, charMs: 28 },
    { prompt: PROMPT.failed, text: 'ROLLBACK;', tone: 'plain', wait: 250, think: 300, charMs: 70 },

    // Each block of the page comes back as its line completes.
    ...rows.map((label, i): ScriptLine => ({
      text: `  ↺ ${label} `.padEnd(width, '.'),
      tone: 'dim',
      wait: i === 0 ? 350 : 60,
      charMs: 4,
      suffix: { text: ' ok', tone: 'ok' },
      restores: i,
    })),
    { text: 'ROLLBACK', tone: 'ok', wait: 200 },

    // Proof, and the moral of the story.
    { prompt: PROMPT.idle, text: count, tone: 'plain', think: 500, charMs: 20 },
    { text: ' count', tone: 'plain', wait: 180 },
    { text: '-------', tone: 'plain', wait: 30 },
    { text: ` ${String(rows.length).padStart(5)}`, tone: 'ok', wait: 30 },
    { text: '(1 row)', tone: 'plain', wait: 30 },
    { text: '', tone: 'plain', wait: 30 },
    { prompt: PROMPT.idle, text: `-- ${copy.lesson}`, tone: 'comment', think: 350, charMs: 24 },
  ];
}

export interface Timing {
  /** When the terminal opens, i.e. how long the page takes to glitch away (ms). */
  openAt: number;
  /** How long the finished session stays up before closing (ms). */
  hold: number;
  /** Terminal exit animation (ms). */
  closeMs: number;
  /** Reduced motion: no typing — each line appears whole (the pauses stay: reading time isn't motion). */
  instant?: boolean;
}

export interface TimedLine extends ScriptLine {
  /** Line (and its prompt) appears. */
  at: number;
  /** Typing starts. */
  typeAt: number;
  /** Fully typed; suffix shown; its row restored. */
  doneAt: number;
}

export interface Timeline {
  lines: TimedLine[];
  openAt: number;
  /** Last line complete. */
  endAt: number;
  /** Terminal starts closing. */
  closeAt: number;
  /** Everything over. */
  total: number;
}

const chars = (s: string) => Array.from(s); // code points: never splits an emoji in half

export function compile(script: ScriptLine[], timing: Timing): Timeline {
  const { openAt, hold, closeMs, instant = false } = timing;
  let t = openAt;
  const lines = script.map((line): TimedLine => {
    const at = t + (line.wait ?? 0);
    const typeAt = at + (line.think ?? 0);
    const doneAt = typeAt + (instant ? 0 : chars(line.text).length * (line.charMs ?? 0));
    t = doneAt;
    return { ...line, at, typeAt, doneAt };
  });
  const closeAt = t + hold;
  return { lines, openAt, endAt: t, closeAt, total: closeAt + closeMs };
}

export type Phase = 'crash' | 'terminal' | 'closing' | 'done';

export interface VisibleLine {
  key: number;
  prompt?: string;
  text: string;
  tone: Tone;
  suffix?: { text: string; tone: Tone };
  /** Blinking cursor at the end of this line (the last one, when it is a prompt). */
  cursor: boolean;
}

export interface Frame {
  phase: Phase;
  lines: VisibleLine[];
  /** How many page rows are back. Rows are restored in order, so this is a count. */
  restored: number;
}

export function frameAt(tl: Timeline, t: number): Frame {
  const phase: Phase = t < tl.openAt ? 'crash' : t < tl.closeAt ? 'terminal' : t < tl.total ? 'closing' : 'done';
  const lines: VisibleLine[] = [];
  let restored = 0;

  for (const [key, line] of tl.lines.entries()) {
    if (t < line.at) break;
    const done = t >= line.doneAt;
    const all = chars(line.text);
    const typed = done ? all.length : Math.max(0, Math.floor((t - line.typeAt) / (line.charMs || 1)));
    if (done && line.restores !== undefined) restored++;
    lines.push({
      key,
      prompt: line.prompt,
      text: all.slice(0, typed).join(''),
      tone: line.tone,
      suffix: done ? line.suffix : undefined,
      cursor: false,
    });
  }

  const last = lines.at(-1);
  if (last?.prompt !== undefined) last.cursor = true;
  return { phase, lines, restored };
}

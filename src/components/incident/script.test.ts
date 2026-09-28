import { describe, expect, it } from 'vitest';
import { dictionaries } from '@/i18n/dictionaries';
import { DELETE_QUERY } from '@/lib/incident';
import { buildScript, compile, frameAt, PROMPT, type Timeline } from './script';
import { rowLabel } from './stage';

const ROWS = ['header', 'section#top', 'div[role=marquee]', 'section#bio', 'footer'];
const TIMING = { openAt: 1000, hold: 2000, closeMs: 400 };

function timeline(rows = ROWS, instant = false): Timeline {
  return compile(buildScript(dictionaries.pt.incident, rows), { ...TIMING, instant });
}

/** Everything printed so far, as plain text (prompt + text + suffix per line). */
function screen(tl: Timeline, t: number): string[] {
  return frameAt(tl, t).lines.map((l) => `${l.prompt ?? ''}${l.text}${l.suffix?.text ?? ''}`);
}

const doneAt = (tl: Timeline, text: string) => tl.lines.find((l) => l.text === text)!.doneAt;

describe('incident script', () => {
  it('replays the sticker query and fails on the WHERE that the ";" orphaned', () => {
    const out = screen(timeline(), Infinity);
    expect(out).toContain(`${PROMPT.tx}${DELETE_QUERY};`);
    expect(out).toContain(`DELETE ${ROWS.length}`);
    expect(out).toContain('ERROR:  syntax error at or near "WHERE" 🫢');
    expect(out).toContain('LINE 1: WHERE name = "NATHAN CAMINI";');
    // The caret points at the W of WHERE.
    expect(out[out.indexOf('LINE 1: WHERE name = "NATHAN CAMINI";') + 1]).toBe(`${' '.repeat(8)}^`);
  });

  it('follows psql transaction states: * inside BEGIN, ! after the error, back to idle after ROLLBACK', () => {
    const prompts = timeline()
      .lines.filter((l) => l.prompt)
      .map((l) => [l.prompt, l.text] as const);
    const failed = prompts.findIndex(([, text]) => text.startsWith('-- '));
    const rollback = prompts.findIndex(([, text]) => text === 'ROLLBACK;');
    expect(prompts[0]).toEqual([PROMPT.idle, 'BEGIN;']);
    expect(prompts[1][0]).toBe(PROMPT.tx);
    for (const [prompt] of prompts.slice(failed, rollback + 1)) expect(prompt).toBe(PROMPT.failed);
    for (const [prompt] of prompts.slice(rollback + 1)) expect(prompt).toBe(PROMPT.idle);
  });

  it('has more than one error before the rollback', () => {
    const errors = screen(timeline(), Infinity).filter((l) => l.startsWith('ERROR:'));
    expect(errors.length).toBeGreaterThan(1);
    expect(errors[1]).toContain('current transaction is aborted');
  });

  it('restores every row once, in page order, only after ROLLBACK; is typed', () => {
    const tl = timeline();
    const restores = tl.lines.filter((l) => l.restores !== undefined);
    expect(restores.map((l) => l.restores)).toEqual(ROWS.map((_, i) => i));
    restores.forEach((l, i) => expect(l.text).toContain(ROWS[i]));

    const rollbackTyped = doneAt(tl, 'ROLLBACK;');
    expect(frameAt(tl, rollbackTyped).restored).toBe(0);
    expect(frameAt(tl, restores[0].doneAt).restored).toBe(1);
    expect(frameAt(tl, restores[2].doneAt - 1).restored).toBe(2);
    expect(frameAt(tl, tl.endAt).restored).toBe(ROWS.length);
    // …and the final count matches what came back.
    expect(screen(tl, Infinity)).toContain(String(ROWS.length).padStart(6));
  });

  it('aligns the restore log', () => {
    const lengths = timeline(['header', 'section#projetos', 'footer'])
      .lines.filter((l) => l.restores !== undefined)
      .map((l) => l.text.length);
    expect(new Set(lengths).size).toBe(1);
  });

  it('is localised prose around untranslated SQL', () => {
    const pt = screen(compile(buildScript(dictionaries.pt.incident, ROWS), TIMING), Infinity);
    const en = screen(compile(buildScript(dictionaries.en.incident, ROWS), TIMING), Infinity);
    expect(pt.length).toBe(en.length);
    expect(pt.filter((l) => l.startsWith('ERROR:'))).toEqual(en.filter((l) => l.startsWith('ERROR:')));
    expect(pt.join('\n')).not.toEqual(en.join('\n'));
  });
});

describe('incident timeline', () => {
  it('goes crash → terminal → closing → done', () => {
    const tl = timeline();
    expect(frameAt(tl, 0).phase).toBe('crash');
    expect(frameAt(tl, 0).lines).toEqual([]);
    expect(frameAt(tl, tl.openAt).phase).toBe('terminal');
    expect(frameAt(tl, tl.closeAt).phase).toBe('closing');
    expect(frameAt(tl, tl.total).phase).toBe('done');
    expect(tl.closeAt - tl.endAt).toBe(TIMING.hold);
    expect(tl.total - tl.closeAt).toBe(TIMING.closeMs);
  });

  it('never goes back in time', () => {
    const { lines } = timeline();
    for (const [i, l] of lines.entries()) {
      expect(l.typeAt).toBeGreaterThanOrEqual(l.at);
      expect(l.doneAt).toBeGreaterThanOrEqual(l.typeAt);
      if (i) expect(l.at).toBeGreaterThanOrEqual(lines[i - 1].doneAt);
    }
  });

  it('types prompt lines character by character, with the cursor on the line being typed', () => {
    const tl = timeline();
    const line = tl.lines.find((l) => l.text === 'ROLLBACK;')!;
    const key = tl.lines.indexOf(line);

    const thinking = frameAt(tl, line.at);
    expect(thinking.lines.at(-1)).toMatchObject({ key, prompt: PROMPT.failed, text: '', cursor: true });

    const typing = frameAt(tl, line.typeAt + 3 * line.charMs!);
    expect(typing.lines.at(-1)).toMatchObject({ key, text: 'ROL', cursor: true });

    // Output lines carry no cursor.
    const output = frameAt(tl, doneAt(tl, `DELETE ${ROWS.length}`));
    expect(output.lines.at(-1)).toMatchObject({ text: `DELETE ${ROWS.length}`, cursor: false });
  });

  it('never splits an emoji while typing', () => {
    const tl = timeline();
    const line = tl.lines.find((l) => l.text.includes('😰'))!;
    for (let t = line.typeAt; t <= line.doneAt; t += 1) {
      const text = frameAt(tl, t).lines.at(-1)!.text;
      expect(text).not.toMatch(/[\uD800-\uDBFF]$/); // no dangling high surrogate
    }
  });

  it('shows the suffix only once the line is complete', () => {
    const tl = timeline();
    const line = tl.lines.find((l) => l.restores === 0)!;
    expect(frameAt(tl, line.doneAt - 1).lines.at(-1)!.suffix).toBeUndefined();
    expect(frameAt(tl, line.doneAt).lines.at(-1)!.suffix).toEqual({ text: ' ok', tone: 'ok' });
  });

  it('prints whole lines at once with reduced motion, keeping the pauses', () => {
    const normal = timeline();
    const instant = timeline(ROWS, true);
    for (const [i, l] of instant.lines.entries()) {
      expect(l.doneAt).toBe(l.typeAt);
      expect(l.typeAt - l.at).toBe(normal.lines[i].typeAt - normal.lines[i].at);
    }
    expect(instant.total).toBeLessThan(normal.total);
  });
});

describe('rowLabel', () => {
  const el = (tagName: string, id = '', attrs: Record<string, string> = {}) => ({
    tagName,
    id,
    getAttribute: (name: string) => attrs[name] ?? null,
  });

  it('reads like a CSS selector', () => {
    expect(rowLabel(el('SECTION', 'bio'))).toBe('section#bio');
    expect(rowLabel(el('DIV', '', { role: 'marquee' }))).toBe('div[role=marquee]');
    expect(rowLabel(el('FOOTER'))).toBe('footer');
  });
});

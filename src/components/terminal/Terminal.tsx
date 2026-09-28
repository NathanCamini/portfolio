'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { Close } from '@/components/ui/icons';
import { useI18n } from '@/i18n/I18nProvider';
import { celebrate } from '@/lib/confetti';
import { resumePdfFile, resumePdfPath } from '@/lib/resume';
import { OPEN_TERMINAL } from '@/lib/terminal';
import { openVolleyball } from '@/lib/volleyball';
import { complete, runCommand, type Line, type Result } from './engine';
import styles from './Terminal.module.css';

interface Entry extends Line {
  id: number;
  /** Echo of what the visitor typed (rendered with the prompt). */
  input?: boolean;
}

/** Stagger between printed lines, so output "streams" like a real terminal. */
const LINE_STAGGER = 22;
const TYPE_SPEED = 70;

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** The keys that open the terminal: ' and ~ (plus ` and the dead-key version on ABNT2 keyboards). */
function isShortcut(e: globalThis.KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === "'" || e.key === '~' || e.key === '`') return true;
  return e.key === 'Dead' && (e.code === 'Quote' || e.code === 'Backquote');
}

/**
 * A playful shell in a centred window: opened from the hero button or by
 * pressing ' / ~ anywhere. On first open it types `help` by itself so the
 * visitor sees every command; each one is clickable. Commands live in engine.ts.
 */
export function Terminal() {
  const { t, locale } = useI18n();
  const T = t.terminal;
  const prompt = `${T.user}@nathan:~$`;

  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const introPlayed = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [windowRef, animate] = useAnimate<HTMLDivElement>();

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  /** Appends lines one by one (respecting each line's delay); resolves when done. */
  const print = useCallback(
    (lines: Line[], onDone?: () => void) => {
      let at = 0;
      setBusy(true);
      for (const line of lines) {
        at += line.delay ?? LINE_STAGGER;
        later(at, () => setEntries((prev) => [...prev, { ...line, id: nextId.current++ }]));
      }
      later(at + 10, () => {
        setBusy(false);
        onDone?.();
      });
    },
    [later],
  );

  const close = useCallback(() => {
    clearTimers();
    setBusy(false);
    setOpen(false);
  }, [clearTimers]);

  const applyEffect = useCallback(
    (result: Result) => {
      switch (result.effect) {
        case 'clear':
          setEntries([]);
          return;
        case 'close':
          close();
          return;
        case 'shake':
          if (windowRef.current) {
            animate(
              windowRef.current,
              { x: [0, -14, 12, -10, 8, -5, 3, 0], rotate: [0, -1, 1, -0.6, 0.4, 0] },
              { duration: 0.6 },
            );
          }
          print(result.lines);
          return;
        case 'confetti':
          print(result.lines, () => celebrate(undefined, 1.2));
          return;
        case 'download':
          print(result.lines, () => {
            const a = document.createElement('a');
            a.href = resumePdfPath(locale);
            a.download = resumePdfFile(locale);
            a.click();
          });
          return;
        case 'volleyball':
          print(result.lines, () =>
            later(450, () => {
              close();
              openVolleyball();
            }),
          );
          return;
        case 'fetch':
          print(result.lines, async () => {
            setBusy(true);
            try {
              const res = await fetch(`/api/nathan?lang=${locale}`, { headers: { Accept: 'application/json' } });
              if (!res.ok || !res.headers.get('Content-Type')?.includes('json')) throw new Error(String(res.status));
              const body = JSON.stringify(await res.json(), null, 2);
              print([
                { text: `HTTP/1.1 ${res.status} OK · ${res.headers.get('Content-Type')}`, tone: 'ok' },
                ...body.split('\n').map((text) => ({ text, delay: 4 })),
              ]);
            } catch {
              print([{ text: T.fetchError, tone: 'danger' }]);
            }
          });
          return;
        default:
          print(result.lines);
      }
    },
    [T.fetchError, animate, close, later, locale, print, windowRef],
  );

  const execute = useCallback(
    (command: string) => {
      setEntries((prev) => [...prev, { id: nextId.current++, text: command, input: true }]);
      if (command.trim()) {
        history.current = [...history.current.filter((h) => h !== command), command];
      }
      historyIndex.current = -1;
      setInput('');
      applyEffect(runCommand(command, t));
    },
    [applyEffect, t],
  );

  // ---- open: event bus + ' / ~ shortcut
  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isShortcut(e) && !isTyping(e.target)) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(OPEN_TERMINAL, show);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_TERMINAL, show);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // ---- while open: focus, scroll lock, first-time intro that types `help`
  useEffect(() => {
    if (!open) return;
    // Touch screens: don't open the virtual keyboard on top of the command list.
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (!introPlayed.current) {
      introPlayed.current = true;
      const intro: Line[] = [
        { text: T.welcome, tone: 'accent', delay: 120 },
        { text: T.shortcut, tone: 'muted' },
      ];
      print(intro, () => {
        setBusy(true);
        const word = 'help';
        [...word].forEach((_, i) => later(250 + i * TYPE_SPEED, () => setInput(word.slice(0, i + 1))));
        later(250 + word.length * TYPE_SPEED + 220, () => execute(word));
      });
    }

    const focusBack = returnFocus.current;
    return () => {
      document.body.style.overflow = overflow;
      focusBack?.focus?.();
    };
    // The intro must only depend on `open`; the strings it reads are stable per locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the newest line in view.
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  useEffect(() => clearTimers, [clearTimers]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!busy) execute(input);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setInput((v) => complete(v, t));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const h = history.current;
      if (!h.length) return;
      let i = historyIndex.current;
      i = e.key === 'ArrowUp' ? (i === -1 ? h.length - 1 : Math.max(0, i - 1)) : i === -1 ? -1 : i + 1;
      if (i >= h.length) i = -1;
      historyIndex.current = i;
      setInput(i === -1 ? '' : h[i]);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            ref={windowRef}
            className={styles.window}
            role="dialog"
            aria-modal="true"
            aria-labelledby="terminal-title"
            onPointerUp={(e) => {
              // Click anywhere → keep typing (unless selecting text to copy). Not on touch:
              // it would pop the virtual keyboard over the output every time a command is tapped.
              if (e.pointerType === 'mouse' && !window.getSelection()?.toString()) inputRef.current?.focus();
            }}
            initial={{ opacity: 0, y: 30, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div className={styles.titlebar}>
              <span className={styles.dots} aria-hidden="true">
                <button type="button" className={styles.dotRed} onClick={close} tabIndex={-1} />
                <span className={styles.dotYellow} />
                <span className={styles.dotGreen} />
              </span>
              <span id="terminal-title" className={styles.title}>
                {T.title}
              </span>
              <button type="button" className={styles.close} onClick={close} aria-label={T.close}>
                <Close size={16} />
              </button>
            </div>

            <div ref={outputRef} className={styles.output} role="log" aria-live="polite">
              {entries.map((entry) =>
                entry.input ? (
                  <div key={entry.id} className={styles.line}>
                    <span className={styles.prompt}>{prompt}</span> {entry.text}
                  </div>
                ) : entry.cmd ? (
                  <button
                    key={entry.id}
                    type="button"
                    className={`${styles.line} ${styles.cmd} ${entry.tone ? styles[entry.tone] : ''}`}
                    onClick={() => !busy && execute(entry.cmd!)}
                    disabled={busy}
                  >
                    <span className={styles.cmdName}>{entry.text}</span>
                    {entry.desc && <span className={styles.desc}>{entry.desc}</span>}
                  </button>
                ) : (
                  <div key={entry.id} className={`${styles.line} ${entry.tone ? styles[entry.tone] : ''}`}>
                    {entry.text || ' '}
                  </div>
                ),
              )}

              <label className={styles.inputRow}>
                <span className={styles.prompt}>{prompt}</span>
                <input
                  ref={inputRef}
                  className={styles.input}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    historyIndex.current = -1;
                  }}
                  onKeyDown={onKeyDown}
                  readOnly={busy}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  enterKeyHint="send"
                  aria-label={T.title}
                />
              </label>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

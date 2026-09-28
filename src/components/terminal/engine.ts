import { site } from '@/config/site';
import { dictionaries } from '@/i18n/dictionaries';
import type { Dictionary } from '@/i18n/types';

/**
 * The terminal's "shell": turns one input line into output lines plus an
 * optional side effect the UI performs (confetti, download, fetch…). Pure and
 * synchronous, so every command is unit-tested without a DOM.
 */

export type Tone = 'muted' | 'accent' | 'ok' | 'warn' | 'danger';

export interface Line {
  text: string;
  tone?: Tone;
  /** Clickable: runs this command when pressed (used by `help`). */
  cmd?: string;
  /** Second column next to a clickable command (help descriptions). */
  desc?: string;
  /** Pause before this line appears, in ms (for dramatic effect). */
  delay?: number;
}

export type Effect = 'clear' | 'close' | 'confetti' | 'shake' | 'download' | 'volleyball' | 'fetch';

export interface Result {
  lines: Line[];
  effect?: Effect;
}

const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

/** Every name a file answers to, in both languages. */
function fileKey(name: string): keyof Dictionary['terminal']['files'] | null {
  const n = name.replace(/^\.\//, '').replace(/\/$/, '').toLowerCase();
  for (const key of ['projects', 'experience', 'education', 'contact', 'resume'] as const) {
    if (n === dictionaries.pt.terminal.files[key] || n === dictionaries.en.terminal.files[key]) return key;
  }
  return null;
}

/** Commands offered by Tab completion. */
export function completions(t: Dictionary): string[] {
  const f = t.terminal.files;
  return [
    ...t.terminal.help.map((h) => h.cmd),
    'help',
    'ls',
    `cat ${f.experience}`,
    `cat ${f.education}`,
    `cat ${f.contact}`,
    'git push --force',
    'echo',
    'date',
    'exit',
  ].filter((c, i, all) => all.indexOf(c) === i);
}

export function complete(input: string, t: Dictionary): string {
  const matches = completions(t).filter((c) => c.startsWith(input));
  if (!input || matches.length === 0) return input;
  if (matches.length === 1) return matches[0];
  // Longest common prefix, like a real shell.
  let prefix = matches[0];
  for (const m of matches) while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix.length > input.length ? prefix : input;
}

function helpLines(t: Dictionary): Line[] {
  return [
    ...t.terminal.help.map((h) => ({ text: h.cmd, desc: h.desc, cmd: h.cmd })),
    { text: t.terminal.helpFooter, tone: 'muted' as const },
  ];
}

export function runCommand(raw: string, t: Dictionary, now = new Date()): Result {
  const input = raw.trim().replace(/\s+/g, ' ');
  const T = t.terminal;
  if (!input) return { lines: [] };

  const [cmd, ...args] = input.split(' ');
  const arg = args.join(' ');
  const lower = input.toLowerCase();

  switch (cmd.toLowerCase()) {
    case 'help':
    case 'ajuda':
    case '?':
      return { lines: helpLines(t) };

    case 'clear':
    case 'cls':
      return { lines: [], effect: 'clear' };

    case 'exit':
    case 'quit':
    case 'sair':
      return { lines: [], effect: 'close' };

    case 'whoami':
      return { lines: T.whoami.map((text, i) => ({ text, tone: i === 0 ? 'accent' : undefined })) };

    case 'echo':
      return { lines: [{ text: arg }] };

    case 'date':
      return { lines: [{ text: now.toString() }] };

    case 'ls':
    case 'dir': {
      if (!arg) {
        const f = T.files;
        return {
          lines: [
            { text: `${f.projects}/`, tone: 'accent', cmd: `ls ${f.projects}` },
            { text: f.experience, cmd: `cat ${f.experience}` },
            { text: f.education, cmd: `cat ${f.education}` },
            { text: f.contact, cmd: `cat ${f.contact}` },
            { text: f.resume, cmd: `open ${f.resume}` },
          ],
        };
      }
      if (fileKey(arg) === 'projects') {
        return {
          lines: t.projects.past.flatMap((p) => [
            { text: `▸ ${p.title}`, tone: 'accent' as const },
            { text: `  ${p.kicker} · ${p.type} · ${p.stack.join(', ')}`, tone: 'muted' as const },
          ]),
        };
      }
      return { lines: [{ text: fill(T.noSuchFile, { file: arg }).replace(/^cat/, 'ls'), tone: 'danger' }] };
    }

    case 'cat':
    case 'type': {
      const key = fileKey(arg);
      if (key === 'experience') {
        return {
          lines: t.bio.exp.flatMap((job, i) => [
            ...(i ? [{ text: '' }] : []),
            { text: `${job.role} @ ${job.company}`, tone: 'accent' as const },
            { text: `${job.period} · ${job.place}`, tone: 'muted' as const },
            ...(job.highlights ?? []).map((h) => ({ text: `  • ${h}` })),
          ]),
        };
      }
      if (key === 'education') {
        return {
          lines: t.bio.edu.flatMap((e) => [
            { text: `${e.course} — ${e.school}`, tone: 'accent' as const },
            { text: `${e.level} · ${e.years} · ${e.status}`, tone: 'muted' as const },
          ]),
        };
      }
      if (key === 'contact') {
        const L = T.contactLabels;
        return {
          lines: [
            { text: `${L.email.padEnd(10)}${site.email}` },
            { text: `${L.linkedin.padEnd(10)}${site.links.linkedin}` },
            { text: `${L.github.padEnd(10)}${site.links.github}` },
          ],
        };
      }
      if (key === 'resume') return { lines: [{ text: fill(T.pdfHint, { file: arg }), tone: 'warn' }] };
      return { lines: [{ text: fill(T.noSuchFile, { file: arg || '?' }), tone: 'danger' }] };
    }

    case 'open':
    case 'xdg-open':
      if (fileKey(arg) === 'resume') {
        return { lines: [{ text: fill(T.downloading, { file: arg }), tone: 'ok' }], effect: 'download' };
      }
      return { lines: [{ text: fill(T.noSuchFile, { file: arg || '?' }).replace(/^cat/, 'open'), tone: 'danger' }] };

    case 'curl':
    case 'wget':
      return { lines: [{ text: fill(T.fetching, { url: '/api/nathan' }), tone: 'muted' }], effect: 'fetch' };

    case 'volei':
    case 'vôlei':
    case 'volleyball':
      return { lines: [{ text: T.volleyball, tone: 'ok' }], effect: 'volleyball' };

    case 'git':
      if (/^git push (-f|--force)/.test(lower)) {
        return {
          lines: T.gitPush.map((text, i) => ({
            text,
            tone: i === T.gitPush.length - 1 ? 'danger' : undefined,
            delay: 350,
          })),
        };
      }
      break;

    case 'rm':
    case 'sudo':
      if (/^(sudo )?rm -(rf|fr) \/\*?$/.test(lower)) {
        return {
          lines: [
            ...T.rm.map((text, i) => ({
              text,
              tone: i === T.rm.length - 1 ? ('danger' as const) : ('warn' as const),
              delay: 380,
            })),
            ...T.rollback.map((text, i) => ({ text, tone: 'ok' as const, delay: i ? 250 : 1100 })),
          ],
          effect: 'shake',
        };
      }
      if (cmd.toLowerCase() === 'sudo') {
        if (/^sudo (contratar|hire) nathan( camini)?$/.test(lower)) {
          return {
            lines: T.hire.map((text, i) => ({
              text,
              tone: i === T.hire.length - 1 ? ('ok' as const) : undefined,
              delay: i ? 420 : 150,
            })),
            effect: 'confetti',
          };
        }
        return { lines: [{ text: fill(T.sudoDenied, { user: T.user }), tone: 'danger' }] };
      }
      break;
  }

  return {
    lines: [
      { text: fill(T.notFound, { cmd }), tone: 'danger' },
      { text: T.creativity, tone: 'muted' },
    ],
  };
}

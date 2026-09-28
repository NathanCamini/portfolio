import { describe, expect, it } from 'vitest';
import { site } from '@/config/site';
import { dictionaries } from '@/i18n/dictionaries';
import { complete, runCommand } from './engine';

const pt = dictionaries.pt;
const en = dictionaries.en;
const text = (input: string, t = pt) => runCommand(input, t).lines.map((l) => l.text);

describe('terminal engine', () => {
  it('every command listed in help does something other than "not found"', () => {
    for (const t of [pt, en]) {
      for (const { cmd } of t.terminal.help) {
        const out = runCommand(cmd, t);
        expect(
          out.lines.some((l) => l.text === t.terminal.creativity),
          cmd,
        ).toBe(false);
      }
    }
  });

  it('help lists the commands as clickable lines', () => {
    const lines = runCommand('help', pt).lines.filter((l) => l.cmd);
    expect(lines.map((l) => l.cmd)).toEqual(pt.terminal.help.map((h) => h.cmd));
  });

  it('unknown commands get the creativity message', () => {
    expect(text('hackear nasa')).toEqual([`hackear: comando não encontrado`, pt.terminal.creativity]);
    expect(text('make coffee', en)[1]).toBe(en.terminal.creativity);
  });

  it('reads the portfolio data, with file names in either language', () => {
    expect(text('ls projetos').join('\n')).toContain(pt.projects.past[0].title);
    expect(text('cat experiencia.txt').join('\n')).toContain('Tramontina');
    expect(text('cat experience.txt').join('\n')).toContain('Tramontina');
    expect(text('cat contact.txt', en).join('\n')).toContain(site.email);
    expect(text('cat formacao.txt').join('\n')).toContain('PUC Minas');
    expect(text('cat segredos.txt')[0]).toBe('cat: segredos.txt: arquivo não encontrado');
  });

  it('effects: hire → confetti, rm -rf / → shake + rollback, open pdf → download, curl → fetch', () => {
    expect(runCommand('sudo contratar nathan', pt).effect).toBe('confetti');
    expect(runCommand('sudo hire nathan', en).effect).toBe('confetti');
    expect(runCommand('sudo make me a sandwich', en).lines[0].text).toContain('sudoers');

    const rm = runCommand('rm -rf /', pt);
    expect(rm.effect).toBe('shake');
    expect(rm.lines.at(-1)?.text).toBe(pt.terminal.rollback.at(-1));
    expect(runCommand('sudo rm -rf /*', pt).effect).toBe('shake');

    expect(runCommand('open curriculo.pdf', pt).effect).toBe('download');
    expect(runCommand('curl /api/nathan', pt).effect).toBe('fetch');
    expect(runCommand('volei', pt).effect).toBe('volleyball');
    expect(runCommand('clear', pt).effect).toBe('clear');
    expect(runCommand('exit', pt).effect).toBe('close');
  });

  it('is forgiving with spacing and case, and ignores empty input', () => {
    expect(runCommand('  WHOAMI  ', pt).lines.length).toBeGreaterThan(0);
    expect(runCommand('   ', pt).lines).toEqual([]);
  });

  it('tab-completes like a shell', () => {
    expect(complete('who', pt)).toBe('whoami');
    expect(complete('cat e', pt)).toBe('cat experiencia.txt');
    expect(complete('cat ', pt)).toBe('cat ');
    expect(complete('zzz', pt)).toBe('zzz');
  });
});

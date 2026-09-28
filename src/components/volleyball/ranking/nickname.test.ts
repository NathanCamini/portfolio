import { describe, expect, it } from 'vitest';
import { checkNickname, type NameProblem } from './nickname';

const reason = (name: string): NameProblem | 'ok' => {
  const r = checkNickname(name);
  return r.ok ? 'ok' : r.reason;
};

describe('nickname filter', () => {
  it('accepts ordinary names, accents and gamer tags', () => {
    for (const name of [
      'Ana',
      'João Pedro',
      'xX_Sniper_Xx',
      'Lucas',
      'Computador',
      'Disputa',
      'Ana-Clara',
      'Night',
      'Nigel',
    ]) {
      expect(reason(name), name).toBe('ok');
    }
    for (const name of [
      'Cassio',
      'Glasses',
      'Assis',
      'Class',
      'Paulo',
      'Cuca',
      'Nazir',
      'Pintor',
      'Player1',
      'Enviado',
      'Pinto',
      'Pica-Pau',
      'Babacar',
    ]) {
      expect(reason(name), name).toBe('ok');
    }
  });

  it('cleans up whitespace and exposes a case/accent-insensitive key', () => {
    expect(checkNickname('  José   Silva ')).toEqual({ ok: true, name: 'José Silva', key: 'jose silva' });
    const a = checkNickname('JOSÉ SILVA');
    expect(a.ok && a.key).toBe('jose silva');
  });

  it('enforces length, charset and a minimum of letters', () => {
    expect(reason('Al')).toBe('length');
    expect(reason('A'.repeat(17))).toBe('length');
    expect(reason('   ')).toBe('length');
    expect(reason('<script>')).toBe('chars');
    expect(reason('site.com')).toBe('chars');
    expect(reason('a@b.cd')).toBe('chars');
    expect(reason('zero​width')).toBe('chars');
    expect(reason('😀😀😀')).toBe('chars');
    expect(reason('Пётр')).toBe('chars'); // look-alike Cyrillic letters could dodge the filter
    expect(reason('12345')).toBe('letters');
    expect(reason('_-_-_')).toBe('letters');
  });

  it('rejects impersonation of staff, the site or the opponent', () => {
    for (const name of ['admin', 'ADMIN', 'Adm1n', 'Moderador', 'The Admin', 'CPU', 'c p u', 'System']) {
      expect(reason(name), name).toBe('reserved');
    }
  });

  it('rejects offensive words in Portuguese and English', () => {
    for (const name of [
      'Caralho',
      'porra',
      'Filho da Puta',
      'fdp',
      'Arrombado',
      'Fuck',
      'Bitch',
      'asshole',
      'Puta',
      'Seu cu',
      'Babaca',
    ]) {
      expect(reason(name), name).toBe('offensive');
    }
  });

  it('sees through common disguises', () => {
    const disguised = [
      'P0rr4', // leetspeak
      'f-u-c-k', // separators
      'f u c k',
      'p u t a',
      'Caaaaralho', // stretched letters
      'puuuta',
      'Puta123', // trailing digits
      'Seu Cú', // accents
      'ｆｕｃｋ', // full-width letters
      'sh1t',
      'Mr Shit',
      'xX_puta_Xx',
      'niiiigga',
      'Glass Hole', // across words
      'Nazi 1488',
      'cool1488',
    ];
    for (const name of disguised) expect(reason(name), name).toBe('offensive');
  });
});

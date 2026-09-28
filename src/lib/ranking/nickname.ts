/**
 * Nickname rules for the global leaderboard. Pure TypeScript, shared by the
 * browser (instant feedback while typing) and the Worker (the check that
 * actually counts — the client copy is only a convenience).
 *
 * Offensive-word detection survives the usual dodges: case, accents,
 * full-width/stylised letters (NFKC), leetspeak ("p0rr4"), separators
 * ("f.u c-k"), stretched letters ("caaaralho") and trailing digits
 * ("puta123"). Two lists keep false positives down (the Scunthorpe problem):
 * BLOCKED terms are unambiguous and matched anywhere; WHOLE_WORD terms are
 * short or have innocent uses inside other words ("cu" in "Lucas", "puta" in
 * "computador"), so they only match a whole word or the whole name.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 16;

export type NameProblem = 'length' | 'chars' | 'letters' | 'reserved' | 'offensive';

export type NameCheck =
  | {
      ok: true;
      /** Cleaned-up name to store and display. */
      name: string;
      /** Case/accent-insensitive identity: one leaderboard row per key. */
      key: string;
    }
  | { ok: false; reason: NameProblem };

/** Latin letters (accents included), ASCII digits, space, underscore and hyphen. */
const ALLOWED = /^[\p{Script=Latin}0-9 _-]+$/u;

/** Matched anywhere in the name, even across words ("glass hole" → "…asshole…"). */
// prettier-ignore
const BLOCKED = [
  // Português
  'caralh', 'krl', 'crl', 'porra', 'merda', 'bosta', 'buceta', 'boceta', 'bct', 'xoxota',
  'xereca', 'piroca', 'punheta', 'siririca', 'cacete', 'caceta', 'foder', 'fuder', 'foda',
  'fodid', 'fudid', 'vsf', 'pqp', 'fdp', 'filhadaputa', 'filhodaputa', 'putaquepariu',
  'putaqueopariu', 'puteiro', 'putinha', 'putona', 'arrombad', 'arombad', 'vadia', 'vagabund',
  'cuzao', 'cuzinho', 'tomarnocu', 'paunocu', 'otario', 'escroto', 'desgracad',
  'corno', 'viadinho', 'viadao', 'bichona', 'baitola', 'boiola', 'traveco', 'sapatao',
  'prostitut', 'retardad', 'mongoloide', 'estupr', 'pedofil', 'nazismo', 'nazista', 'hitler',
  // English
  'fuck', 'fck', 'phuck', 'shit', 'bitch', 'cunt', 'nigg', 'faggot', 'fagot', 'whore', 'slut',
  'asshole', 'pussy', 'bastard', 'retard', 'rapist', 'porn', 'penis', 'vagina', 'dildo', 'twat',
  'jizz', 'wanker', 'motherf',
];

/**
 * Only matched as a whole word or as the whole name. Words with a common
 * innocent reading are left out on purpose: "Pinto" is a surname, "Pica-Pau"
 * a cartoon.
 */
// prettier-ignore
const WHOLE_WORD = [
  'cu', 'puta', 'putas', 'rola', 'bunda', 'viado', 'veado', 'bicha', 'babaca', 'piranha',
  'crioulo', 'mongol', 'tnc', 'nazi', 'nazis', 'heil',
  'ass', 'dick', 'cock', 'fag', 'fuk', 'rape', 'sex', 'cum', 'anal', 'tit', 'tits', 'boobs',
  'wank',
];

/** Names that would impersonate the site, the staff or the opponent. */
// prettier-ignore
const RESERVED = [
  'admin', 'adm', 'administrador', 'administrator', 'moderador', 'moderator', 'mod', 'root',
  'system', 'sistema', 'suporte', 'support', 'staff', 'owner', 'dono', 'cpu', 'bot', 'null',
  'undefined', 'anonymous', 'anonimo', 'voce', 'you',
];

/** Hate-symbol numbers, matched anywhere in the digits of the name. */
const BLOCKED_NUMBERS = ['1488'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };

/**
 * Each run of a letter may be stretched but never shortened: "nigg" matches
 * "niiigga" but not "Nigel", and "ass" matches "asss" but not "as".
 */
const stretchable = (term: string) => term.replace(/(.)\1*/g, (run, ch: string) => `${ch}{${run.length},}`);
const anywhere = BLOCKED.map((t) => new RegExp(stretchable(t)));
const whole = (terms: string[]) => terms.map((t) => new RegExp(`^${stretchable(t)}$`));
const wholeWord = whole(WHOLE_WORD);
const reserved = whole(RESERVED);

/** Lowercase and drop accents: "JOSÉ" → "jose". */
const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
/** Two readings of the digits: leetspeak ("p0rr4" → "porra") or noise ("puta123" → "puta"). */
const readings = (s: string) => [s.replace(/[0-9]/g, (d) => LEET[d] ?? ''), s.replace(/[0-9]/g, '')];

export function checkNickname(raw: string): NameCheck {
  // NFKC folds look-alikes such as full-width "ｆｕｃｋ" into plain letters.
  const name = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const length = [...name].length;
  if (length < NAME_MIN || length > NAME_MAX) return { ok: false, reason: 'length' };
  if (!ALLOWED.test(name)) return { ok: false, reason: 'chars' };
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return { ok: false, reason: 'letters' };

  const key = fold(name);
  const words = key.split(/[ _-]+/).filter(Boolean);
  // The name glued together catches split words: "p u t a", "f-u-c-k".
  const glued = readings(words.join(''));
  const candidates = [...words.flatMap(readings), ...glued];
  const hit = (patterns: RegExp[], texts: string[]) => patterns.some((p) => texts.some((t) => p.test(t)));

  if (hit(reserved, candidates)) return { ok: false, reason: 'reserved' };
  if (
    hit(anywhere, glued) ||
    hit(wholeWord, candidates) ||
    BLOCKED_NUMBERS.some((n) => key.replace(/[^0-9]/g, '').includes(n))
  ) {
    return { ok: false, reason: 'offensive' };
  }
  return { ok: true, name, key };
}

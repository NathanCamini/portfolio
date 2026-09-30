import { site } from '@/config/site';
import { locales, type Locale } from '@/i18n/config';

/**
 * Links to the full volleyball game (online 1×1, Endless, rankings), which
 * left this site for its own (NathanCamini/volleyball_game, docs/separacao.md
 * there). Without NEXT_PUBLIC_GAME_URL (local builds, forks) they point at
 * its repository.
 */

/** Old room links (`#volei-CODE`), from when the online game lived here: 5 characters, no look-alikes. */
const ROOM_HASH = /^#volei-([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5})$/i;

export function roomFromHash(hash: string): string | null {
  const m = ROOM_HASH.exec(hash);
  return m ? m[1].toUpperCase() : null;
}

const TRAILING_LOCALE = new RegExp(`/(${locales.join('|')})$`);

/**
 * The game's root from NEXT_PUBLIC_GAME_URL, however it was typed: without a
 * trailing slash, query or fragment, or a language path (`…/pt` would
 * otherwise become `…/pt/pt`, a page that doesn't exist).
 */
export function gameRoot(url: string): string {
  return url
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(TRAILING_LOCALE, '')
    .replace(/\/+$/, '');
}

/** The game in the visitor's language; `room` opens an old room link there. Pure: safe to render. */
export function gameLink(locale: Locale, room?: string | null): string {
  if (!site.gameUrl) return site.gameRepo;
  const base = `${gameRoot(site.gameUrl)}/${locale}`;
  return room ? `${base}#volei-${room}` : base;
}

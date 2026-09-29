import { site } from '@/config/site';
import type { Locale } from '@/i18n/config';

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

/**
 * Someone who played online here: their browser id (the one their Elo rating
 * hangs on) and nickname stayed in this origin's localStorage. The link
 * carries them in the fragment (never sent to a server), and the game keeps
 * them if that browser has nothing there yet.
 */
function handoff(): string {
  try {
    const pid = localStorage.getItem('volley-player');
    if (!pid || !/^[0-9a-f]{32}$/.test(pid)) return '';
    const name = localStorage.getItem('ranking-name') ?? '';
    return `#import=${pid}${name ? `.${encodeURIComponent(name)}` : ''}`;
  } catch {
    return '';
  }
}

/** The game in the visitor's language; `room` opens an old room link there. Pure: safe to render. */
export function gameLink(locale: Locale, room?: string | null): string {
  if (!site.gameUrl) return site.gameRepo;
  const base = `${site.gameUrl.replace(/\/$/, '')}/${locale}`;
  return room ? `${base}#volei-${room}` : base;
}

/** The same link with this browser's online identity attached (read at click time, in the browser). */
export function gameLinkWithHandoff(locale: Locale): string {
  const link = gameLink(locale);
  return site.gameUrl ? `${link}${handoff()}` : link;
}

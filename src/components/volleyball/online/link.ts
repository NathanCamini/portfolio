import { isRoomCode, normalizeRoomCode } from '@/lib/volley-online/protocol';

/**
 * A room's link is the site's root with `#volei-CODE`: the root redirect keeps
 * the hash (src/i18n/detect.ts), so the friend gets the site in their own
 * language, and VolleyballSection opens the online tab on that room.
 * The page also keeps the hash while you're in the room, so a refresh
 * rejoins it (the seat is held for a few seconds, see NET.RECONNECT_GRACE_MS).
 */
const PREFIX = '#volei-';

export const roomHash = (code: string) => `${PREFIX}${code}`;

export const roomLink = (origin: string, code: string) => `${origin}/${roomHash(code)}`;

/** The room code in a `location.hash`, or null. */
export function roomFromHash(hash: string): string | null {
  if (!hash.toLowerCase().startsWith(PREFIX)) return null;
  const code = normalizeRoomCode(hash.slice(PREFIX.length));
  return isRoomCode(code) ? code : null;
}

/** Puts the room in the address bar (or takes it out) without a navigation or a history entry. */
export function showRoomInUrl(code: string | null) {
  const current = roomFromHash(location.hash);
  if (code === current) return; // already there (or no room hash to clear)
  history.replaceState(history.state, '', `${location.pathname}${location.search}${code ? roomHash(code) : ''}`);
}

const ACTIVE_KEY = 'volley-online:active';

/**
 * The room this browser is seated in, kept in localStorage (unlike the hash,
 * it survives closing the tab): reopening the site while that match is still
 * on goes straight back to it (VolleyballSection). Cleared on leaving, at the
 * final whistle, and when the server turns us away.
 */
export function rememberActiveRoom(code: string | null) {
  try {
    if (code) localStorage.setItem(ACTIVE_KEY, code);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* no storage: only the link (or the hash) brings you back */
  }
}

/** The room to go back to, if the page was closed mid-match and that match is still on. */
export async function activeRoom(): Promise<string | null> {
  let code: string | null = null;
  try {
    code = normalizeRoomCode(localStorage.getItem(ACTIVE_KEY) ?? '');
  } catch {
    return null;
  }
  if (!isRoomCode(code)) return null;
  try {
    const res = await fetch(`/api/volley/rooms/${code}`, { cache: 'no-store' });
    if (res.ok) {
      const { phase } = (await res.json()) as { phase: string };
      if (phase === 'countdown' || phase === 'playing' || phase === 'paused') return code;
    }
    if (res.status !== 404 && !res.ok) return null; // can't tell: keep it for next time
  } catch {
    return null;
  }
  rememberActiveRoom(null);
  return null;
}

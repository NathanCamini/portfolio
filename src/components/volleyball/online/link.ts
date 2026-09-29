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

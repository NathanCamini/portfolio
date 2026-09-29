/**
 * The browser's online identity (docs/volei-online.md, "Ranking online"):
 * 128 random bits kept in localStorage, sent when joining a room or the
 * queue. The server stores only its SHA-256, so the rating belongs to this
 * browser whatever nickname it uses. Without storage (private mode) each
 * visit is a new player.
 */
const KEY = 'volley-player';

let memory: string | null = null;

const randomId = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function playerId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved;
    const id = randomId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return (memory ??= randomId());
  }
}

/** What the board is keyed by: the SHA-256 of the id, hex (asking for your standing never reveals the id). */
export async function playerHash(): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(playerId()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

import type {
  ApiErrorBody,
  GameId,
  StartResponse,
  SubmitRequest,
  SubmitResponse,
  TopResponse,
} from '@/lib/ranking/contract';

/**
 * Browser client for the ranking Worker (worker/index.ts), for any game. Any
 * failure — no network, `next dev` without the Worker, a 5xx — comes back as
 * an error value instead of throwing, so the games never depend on the API.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

const UNAVAILABLE: ApiResult<never> = { ok: false, error: { error: 'unavailable' } };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/ranking/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok && data) return { ok: true, data: data as T };
    if (data && typeof (data as ApiErrorBody).error === 'string') return { ok: false, error: data as ApiErrorBody };
    return UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

export const fetchTop = (game: GameId) => call<TopResponse>('GET', game);
/** Called when a run kicks off: the ticket the score will be saved against. */
export const openMatch = (game: GameId) => call<StartResponse>('POST', `${game}/matches`);
export const submitScore = (game: GameId, req: SubmitRequest) => call<SubmitResponse>('POST', `${game}/scores`, req);

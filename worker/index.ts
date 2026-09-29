import {
  isGame,
  RANKING,
  type ApiErrorBody,
  type ApiErrorCode,
  type GameId,
  type StartResponse,
  type TopResponse,
} from '../src/lib/ranking/contract';
import { checkNickname } from '../src/lib/ranking/nickname';
import { RULES, type GameResults, type GameRules } from '../src/lib/ranking/rules';
import { handleApiRequest } from '../src/lib/resume-api';
import * as store from './store';

/**
 * Cloudflare Worker. `run_worker_first: ["/api/*"]` in wrangler.jsonc routes
 * only the API here; every other path is served directly from the static assets.
 *
 * `/api/ranking/:game` is the Peek Trainer's ranking (built for any number of
 * games; the volleyball Endless board moved to the game's own site with the
 * rest of it); the rest of `/api` (GET /api/nathan, the résumé) is
 * src/lib/resume-api.ts.
 *
 *   GET  /api/ranking/:game          → the game's top 10 (each player's best)
 *   POST /api/ranking/:game/matches  → a single-use ticket, issued when a run kicks off
 *   POST /api/ranking/:game/scores   → name + the game's result; the server validates it
 *
 * Anti-cheat, by layer: the result must pass the game's own rules
 * (src/lib/ranking/rules.ts: counts that fit the engine, a clock that fits
 * the time the server saw pass since the ticket was issued); each ticket buys
 * one score; kickoffs and submissions are rate limited per IP. It stops casual
 * tampering (editing the request in DevTools, replaying it); a patient forger
 * could still post a plausible result.
 */

export interface Env {
  /** Absent on preview deployments (see wrangler.jsonc): the API answers 503 and the games play offline. */
  DB?: D1Database;
  KICKOFF_LIMIT?: RateLimit;
  SUBMIT_LIMIT?: RateLimit;
}

const RANKING_PATH = /^\/api\/ranking\/([a-z]+)(\/matches|\/scores)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 1024;

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error);
  }
}

const fail = (status: number, error: ApiErrorCode, extra?: Omit<ApiErrorBody, 'error'>) =>
  new ApiError(status, { error, ...extra });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/ranking/')) return handleApiRequest(request);
    try {
      return await route(request, url, env);
    } catch (err) {
      if (err instanceof ApiError) return json(err.body, err.status);
      console.error('ranking api error', err);
      return json({ error: 'unavailable' } satisfies ApiErrorBody, 503);
    }
  },
} satisfies ExportedHandler<Env>;

function route(request: Request, url: URL, env: Env): Promise<Response> {
  const [, game = '', action = ''] = RANKING_PATH.exec(url.pathname) ?? [];
  if (!isGame(game)) throw fail(404, 'not_found');
  switch (`${request.method} ${action}`) {
    case 'GET ':
      return board(game, env);
    case 'POST /matches':
      return kickoff(game, request, url, env);
    case 'POST /scores':
      return submit(game, request, url, env);
    default:
      throw fail(404, 'not_found');
  }
}

async function board(game: GameId, env: Env): Promise<Response> {
  const top = await store.top(database(env), game, RANKING.TOP);
  return json({ top } satisfies TopResponse);
}

async function kickoff(game: GameId, request: Request, url: URL, env: Env): Promise<Response> {
  sameOrigin(request, url);
  await rateLimit(env.KICKOFF_LIMIT, request);
  const db = database(env);
  const matchId = crypto.randomUUID();
  const now = Date.now();
  await store.openMatch(db, game, matchId, now, now - RANKING.MATCH_TTL_MS);
  return json({ matchId } satisfies StartResponse, 201);
}

async function submit<G extends GameId>(game: G, request: Request, url: URL, env: Env): Promise<Response> {
  sameOrigin(request, url);
  await rateLimit(env.SUBMIT_LIMIT, request);
  const body = await readJson(request);
  const {
    matchId,
    name,
    result: raw,
  } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof matchId !== 'string' || !UUID.test(matchId) || typeof name !== 'string' || name.length > 64) {
    throw fail(400, 'bad_request');
  }
  const rules: GameRules<GameResults[G]> = RULES[game];
  const result = rules.parse(raw);
  if (!result) throw fail(400, 'bad_request');

  // The name first: a refused name doesn't spend the ticket, so the player can fix it and retry.
  const nick = checkNickname(name);
  if (!nick.ok) throw fail(422, 'invalid_name', { reason: nick.reason });

  const db = database(env);
  const startedAt = await store.matchStartedAt(db, game, matchId);
  if (startedAt === null) throw fail(404, 'match_not_found');
  const now = Date.now();
  const elapsed = now - startedAt;
  if (elapsed > RANKING.MATCH_TTL_MS) throw fail(410, 'match_expired');
  const problem = rules.check(result, elapsed);
  if (problem) throw fail(422, problem);

  const saved = await store.saveScore(
    db,
    {
      game,
      matchId,
      name: nick.name,
      key: nick.key,
      score: rules.score(result),
      detail: rules.detail(result),
      now,
    },
    RANKING.TOP,
  );
  if (!saved) throw fail(404, 'match_not_found');
  return json(saved, 201);
}

function database(env: Env): D1Database {
  if (!env.DB) throw fail(503, 'unavailable');
  return env.DB;
}

/** Browsers always send Origin on cross-site POSTs; a page elsewhere can't drive this API. */
function sameOrigin(request: Request, url: URL) {
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== url.origin) throw fail(403, 'bad_request');
}

async function rateLimit(limiter: RateLimit | undefined, request: Request) {
  if (!limiter) return;
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await limiter.limit({ key });
  if (!success) throw fail(429, 'rate_limited');
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw fail(415, 'bad_request');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw fail(413, 'bad_request');
  const text = await request.text();
  if (text.length > MAX_BODY) throw fail(413, 'bad_request');
  try {
    return JSON.parse(text);
  } catch {
    throw fail(400, 'bad_request');
  }
}

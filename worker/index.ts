import { gameConfig } from '../src/config/game';
import {
  checkResult,
  RANKING,
  scoreMatch,
  type ApiErrorBody,
  type ApiErrorCode,
  type StartResponse,
  type SubmitRequest,
  type TopResponse,
} from '../src/components/volleyball/ranking/match';
import { checkNickname } from '../src/components/volleyball/ranking/nickname';
import { handleApiRequest } from '../src/lib/resume-api';
import * as store from './store';

/**
 * Cloudflare Worker. `run_worker_first: ["/api/*"]` in wrangler.jsonc routes
 * only the API here; every other path is served directly from the static assets.
 *
 * `/api/volley/*` is the beach-volley ranking below; the rest of `/api`
 * (GET /api/nathan, the résumé) is src/lib/resume-api.ts.
 *
 *   GET  /api/volley/ranking  → the top 10 (each player's best)
 *   POST /api/volley/matches  → a single-use ticket, issued at kickoff
 *   POST /api/volley/scores   → name + result; the server validates and scores it
 *
 * Anti-cheat, by layer: the client never sends a score, only the scoreline
 * and the match clock, and the server computes the points itself; the
 * scoreline must be one a match can end on; the clock must fit the minimum
 * time per point AND the time the server saw pass since the ticket was
 * issued; each ticket buys one score; kickoffs and submissions are rate
 * limited per IP. It stops casual tampering (editing the request in DevTools,
 * replaying it); a patient forger could still post a plausible result.
 */

export interface Env {
  /** Absent on preview deployments (see wrangler.jsonc): the API answers 503 and the game plays offline. */
  DB?: D1Database;
  KICKOFF_LIMIT?: RateLimit;
  SUBMIT_LIMIT?: RateLimit;
}

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
    if (!url.pathname.startsWith('/api/volley/')) return handleApiRequest(request);
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
  switch (`${request.method} ${url.pathname}`) {
    case 'GET /api/volley/ranking':
      return ranking(env);
    case 'POST /api/volley/matches':
      return kickoff(request, url, env);
    case 'POST /api/volley/scores':
      return submit(request, url, env);
    default:
      throw fail(404, 'not_found');
  }
}

async function ranking(env: Env): Promise<Response> {
  const top = await store.top(database(env), RANKING.TOP);
  return json({ top } satisfies TopResponse);
}

async function kickoff(request: Request, url: URL, env: Env): Promise<Response> {
  sameOrigin(request, url);
  await rateLimit(env.KICKOFF_LIMIT, request);
  const db = database(env);
  const matchId = crypto.randomUUID();
  const now = Date.now();
  await store.openMatch(db, matchId, now, now - RANKING.MATCH_TTL_MS);
  return json({ matchId } satisfies StartResponse, 201);
}

async function submit(request: Request, url: URL, env: Env): Promise<Response> {
  sameOrigin(request, url);
  await rateLimit(env.SUBMIT_LIMIT, request);
  const body = parseSubmit(await readJson(request));

  // Cheap checks first; none of them spend the ticket, so the player can fix the name and retry.
  const nick = checkNickname(body.name);
  if (!nick.ok) throw fail(422, 'invalid_name', { reason: nick.reason });
  const result = { player: body.player, cpu: body.cpu, durationMs: body.durationMs };
  const problem = checkResult(result, gameConfig.winScore);
  if (problem) throw fail(422, problem);
  const score = scoreMatch(result);
  if (score <= 0) throw fail(422, 'invalid_result');

  const db = database(env);
  const startedAt = await store.matchStartedAt(db, body.matchId);
  if (startedAt === null) throw fail(404, 'match_not_found');
  const now = Date.now();
  const elapsed = now - startedAt;
  if (elapsed > RANKING.MATCH_TTL_MS) throw fail(410, 'match_expired');
  // The game clock can't have run longer than the server has known about the match.
  if (result.durationMs > elapsed + RANKING.CLOCK_SLACK_MS) throw fail(422, 'too_fast');

  const saved = await store.saveScore(
    db,
    { matchId: body.matchId, name: nick.name, key: nick.key, score, ...result, now },
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

function parseSubmit(value: unknown): SubmitRequest {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const { matchId, name, player, cpu, durationMs } = v;
  if (
    typeof matchId !== 'string' ||
    !UUID.test(matchId) ||
    typeof name !== 'string' ||
    name.length > 64 ||
    typeof player !== 'number' ||
    typeof cpu !== 'number' ||
    typeof durationMs !== 'number'
  ) {
    throw fail(400, 'bad_request');
  }
  return { matchId, name, player, cpu, durationMs };
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUND_MS } from '../../src/components/siege/engine';
import { RANKING, type GameId, type SubmitResponse, type TopResponse } from '../../src/lib/ranking/contract';
import type { PeekResult } from '../../src/lib/ranking/rules';
import worker, { type Env } from '../index';
import { createD1 } from './d1';

const ORIGIN = 'https://portfolio.test';
let env: Env;

/** What the Worker receives: an incoming request (the runtime adds the `cf` metadata). */
const handle = (url: string, init: RequestInit) =>
  worker.fetch(new Request(url, init) as Request<unknown, IncomingRequestCfProperties>, env);

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { Origin: ORIGIN, ...headers } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json', ...init.headers };
  }
  return handle(`${ORIGIN}${path}`, init);
}

const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);
const board = async (game: GameId) => ((await (await call('GET', `/api/ranking/${game}`)).json()) as TopResponse).top;
const kickoff = async (game: GameId) =>
  ((await (await call('POST', `/api/ranking/${game}/matches`)).json()) as { matchId: string }).matchId;
const submit = (game: GameId, matchId: string, name: string, result: unknown) =>
  call('POST', `/api/ranking/${game}/scores`, { matchId, name, result });

const round = (score: number, extra: Partial<PeekResult> = {}): PeekResult => ({
  score,
  shots: 40,
  hits: 30,
  headshots: 20,
  bestStreak: 15,
  ...extra,
});

async function peek(name: string, result: PeekResult) {
  const id = await kickoff('peek');
  wait(ROUND_MS + 2000);
  return submit('peek', id, name, result);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  env = { DB: createD1() };
});
afterEach(() => vi.useRealTimers());

describe('ranking API', () => {
  it('creates its tables on first use and starts with an empty board', async () => {
    expect(await board('peek')).toEqual([]);
  });

  it('saves a Peek Trainer round, ranked by its score', async () => {
    const res = await peek('Ana', round(2400));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      score: 2400,
      position: 1,
      top: [{ name: 'Ana', score: 2400, detail: { hits: 30, shots: 40, headshots: 20, bestStreak: 15 } }],
    });
  });

  it("no longer serves the volleyball board: it moved to the game's own site", async () => {
    expect((await call('GET', '/api/ranking/volley')).status).toBe(404);
    expect((await call('POST', '/api/ranking/volley/matches')).status).toBe(404);
  });

  it("only accepts a ticket once, while it's fresh", async () => {
    const id = await kickoff('peek');
    wait(ROUND_MS + 2000);
    expect((await submit('peek', id, 'Ana', round(100))).status).toBe(201);
    expect((await submit('peek', id, 'Ana', round(100))).status).toBe(404);

    const stale = await kickoff('peek');
    wait(RANKING.MATCH_TTL_MS + 1);
    expect((await submit('peek', stale, 'Ana', round(100))).status).toBe(410);
  });

  it('refuses bad names without spending the ticket', async () => {
    const id = await kickoff('peek');
    wait(ROUND_MS);
    for (const [name, reason] of [
      ['P0rr4', 'offensive'],
      ['Admin', 'reserved'],
      ['<b>x</b>', 'chars'],
      ['Al', 'length'],
    ]) {
      const res = await submit('peek', id, name, round(900));
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: 'invalid_name', reason });
    }
    expect((await submit('peek', id, 'Ana', round(900))).status).toBe(201);
  });

  it("checks the result with the game's rules", async () => {
    const expectError = async (res: Response, error: string) => {
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: string }).error).toBe(error);
    };
    // Peek: a round lasts 30 s, and the counts must add up.
    const early = await kickoff('peek');
    wait(10_000);
    await expectError(await submit('peek', early, 'Ana', round(900)), 'too_fast');
    wait(ROUND_MS);
    await expectError(await submit('peek', early, 'Ana', round(900, { headshots: 31 })), 'invalid_result');
    await expectError(await submit('peek', early, 'Ana', round(99_999)), 'invalid_result');
    expect((await submit('peek', early, 'Ana', round(900))).status).toBe(201);

    // Malformed results are bad requests.
    const other = await kickoff('peek');
    wait(ROUND_MS);
    expect((await submit('peek', other, 'Ana', 'nope')).status).toBe(400);
  });

  it("keeps each player's best, merging case and accents, ties to whoever was first", async () => {
    await peek('José', round(2000));
    await peek('Bruno', round(1500));
    const worse = (await (await peek('JOSE', round(500))).json()) as SubmitResponse;
    expect(worse).toMatchObject({ score: 500, best: 2000, personalBest: false, position: 1 });
    const tie = (await (await peek('Carla', round(2000))).json()) as SubmitResponse;
    expect(tie.position).toBe(2);
    expect((await board('peek')).map((e) => [e.name, e.score])).toEqual([
      ['José', 2000],
      ['Carla', 2000],
      ['Bruno', 1500],
    ]);
  });

  it('shows at most the top 10', async () => {
    for (let i = 0; i < 12; i++) await peek(`Player ${String.fromCharCode(65 + i)}`, round(100 * i));
    const top = await board('peek');
    expect(top).toHaveLength(RANKING.TOP);
    expect(top[0]).toMatchObject({ name: 'Player L', score: 1100 });
  });

  it('guards the edges of the API', async () => {
    expect((await call('GET', '/api/ranking/chess')).status).toBe(404);
    expect((await call('GET', '/api/ranking/peek/nothing')).status).toBe(404);
    expect((await call('POST', '/api/ranking/peek/scores', {}, { Origin: 'https://evil.test' })).status).toBe(403);
    const plain = await handle(`${ORIGIN}/api/ranking/peek/scores`, {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(plain.status).toBe(415);
    expect((await call('POST', '/api/ranking/peek/scores', { matchId: 'nope' })).status).toBe(400);
    // The rest of /api is the résumé API (src/lib/resume-api.ts).
    const resume = await call('GET', '/api/nathan?lang=pt');
    expect(resume.status).toBe(200);
    expect(resume.headers.get('Content-Language')).toBe('pt-BR');

    env.KICKOFF_LIMIT = { limit: async () => ({ success: false }) };
    expect((await call('POST', '/api/ranking/peek/matches')).status).toBe(429);

    delete env.DB; // e.g. a preview deployment
    expect(await (await call('GET', '/api/ranking/peek')).json()).toEqual({ error: 'unavailable' });
  });
});

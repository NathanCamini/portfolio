import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RANKING,
  scoreMatch,
  type SubmitResponse,
  type TopResponse,
} from '../../src/components/volleyball/ranking/match';
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

const kickoff = async () => ((await (await call('POST', '/api/volley/matches')).json()) as { matchId: string }).matchId;
const submit = (matchId: string, name: string, player: number, cpu: number, durationMs: number) =>
  call('POST', '/api/volley/scores', { matchId, name, player, cpu, durationMs });
const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);

/** Kickoff, let the server clock run as long as the match, save. */
async function play(name: string, player: number, cpu: number, durationMs: number) {
  const id = await kickoff();
  wait(durationMs);
  return submit(id, name, player, cpu, durationMs);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  env = { DB: createD1() };
});
afterEach(() => vi.useRealTimers());

describe('ranking API', () => {
  it('creates its tables on first use and starts empty', async () => {
    const res = await call('GET', '/api/volley/ranking');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ top: [] });
  });

  it('saves a real match and scores it on the server', async () => {
    const res = await play('  Ana   Clara ', 7, 2, 95_000);
    expect(res.status).toBe(201);
    const body = (await res.json()) as SubmitResponse;
    const score = scoreMatch({ player: 7, cpu: 2, durationMs: 95_000 });
    expect(body).toMatchObject({ score, best: score, personalBest: true, position: 1 });
    expect(body.top).toEqual([{ name: 'Ana Clara', score, player: 7, cpu: 2, durationMs: 95_000, at: Date.now() }]);
  });

  it('refuses bad names without spending the ticket', async () => {
    const id = await kickoff();
    wait(60_000);
    for (const [name, reason] of [
      ['P0rr4', 'offensive'],
      ['Admin', 'reserved'],
      ['<b>x</b>', 'chars'],
      ['Al', 'length'],
    ]) {
      const res = await submit(id, name, 7, 3, 60_000);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: 'invalid_name', reason });
    }
    expect((await submit(id, 'Ana', 7, 3, 60_000)).status).toBe(201);
  });

  it('refuses scorelines and clocks a real match cannot produce', async () => {
    const id = await kickoff();
    wait(30_000);
    const expectError = async (res: Response, status: number, error: string) => {
      expect(res.status).toBe(status);
      expect(((await res.json()) as { error: string }).error).toBe(error);
    };
    await expectError(await submit(id, 'Ana', 99, 0, 30_000), 422, 'invalid_result');
    await expectError(await submit(id, 'Ana', 6, 5, 30_000), 422, 'invalid_result');
    await expectError(await submit(id, 'Ana', 0, 7, 30_000), 422, 'invalid_result'); // worth 0 points
    // Faster than the rules allow…
    await expectError(await submit(id, 'Ana', 7, 0, 7 * RANKING.MIN_MS_PER_POINT - 1), 422, 'too_fast');
    // …or longer than the server has known about the match.
    await expectError(await submit(id, 'Ana', 7, 0, 30_000 + RANKING.CLOCK_SLACK_MS + 1), 422, 'too_fast');
    expect((await submit(id, 'Ana', 7, 0, 30_000)).status).toBe(201);
  });

  it('accepts each ticket once, and only while it is fresh', async () => {
    const id = await kickoff();
    wait(20_000);
    expect((await submit(id, 'Ana', 7, 0, 20_000)).status).toBe(201);
    expect((await submit(id, 'Ana', 7, 0, 20_000)).status).toBe(404);
    expect((await submit(crypto.randomUUID(), 'Ana', 7, 0, 20_000)).status).toBe(404);

    const stale = await kickoff();
    wait(RANKING.MATCH_TTL_MS + 1);
    expect((await submit(stale, 'Ana', 7, 0, 20_000)).status).toBe(410);
  });

  it("keeps each player's best, merging case and accents, ties to whoever was first", async () => {
    await play('José', 7, 0, 20_000);
    await play('Bruno', 7, 3, 60_000);
    const worse = (await (await play('JOSE', 7, 5, 90_000)).json()) as SubmitResponse;
    expect(worse).toMatchObject({ personalBest: false, position: 1 });
    const tie = (await (await play('Carla', 7, 0, 20_000)).json()) as SubmitResponse;
    expect(tie.position).toBe(2);

    const { top } = (await (await call('GET', '/api/volley/ranking')).json()) as TopResponse;
    expect(top.map((e) => e.name)).toEqual(['José', 'Carla', 'Bruno']);
  });

  it('shows at most the top 10', async () => {
    for (let i = 0; i < 12; i++) await play(`Player ${String.fromCharCode(65 + i)}`, 7, i % 7, 60_000 + i * 1000);
    const { top } = (await (await call('GET', '/api/volley/ranking')).json()) as TopResponse;
    expect(top).toHaveLength(RANKING.TOP);
  });

  it('guards the edges of the API', async () => {
    expect((await call('POST', '/api/volley/scores', {}, { Origin: 'https://evil.test' })).status).toBe(403);
    const plain = await handle(`${ORIGIN}/api/volley/scores`, {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(plain.status).toBe(415);
    expect((await call('POST', '/api/volley/scores', { matchId: 'nope' })).status).toBe(400);
    expect((await call('GET', '/api/volley/nothing')).status).toBe(404);
    // The rest of /api is the résumé API (src/lib/resume-api.ts).
    const resume = await call('GET', '/api/nathan?lang=pt');
    expect(resume.status).toBe(200);
    expect(resume.headers.get('Content-Language')).toBe('pt-BR');

    env.KICKOFF_LIMIT = { limit: async () => ({ success: false }) };
    expect((await call('POST', '/api/volley/matches')).status).toBe(429);

    delete env.DB; // e.g. a preview deployment
    expect(await (await call('GET', '/api/volley/ranking')).json()).toEqual({ error: 'unavailable' });
  });
});

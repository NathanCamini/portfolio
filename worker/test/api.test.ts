import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RANKING, type SubmitResponse, type TopResponse } from '../../src/components/volleyball/ranking/match';
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

/** Shortest clock a run with these points can have: the player's points plus the CPU's 7. */
const fastest = (points: number) => (points + 7) * RANKING.MIN_MS_PER_POINT;

const kickoff = async () => ((await (await call('POST', '/api/volley/matches')).json()) as { matchId: string }).matchId;
const submit = (matchId: string, name: string, points: number, durationMs: number) =>
  call('POST', '/api/volley/scores', { matchId, name, points, durationMs });
const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);

/** Kickoff, let the server clock run as long as the run, save. */
async function play(name: string, points: number, durationMs = fastest(points) + 1000) {
  const id = await kickoff();
  wait(durationMs);
  return submit(id, name, points, durationMs);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  env = { DB: createD1() };
});
afterEach(() => vi.useRealTimers());

describe('ranking API (endless runs)', () => {
  it('creates its tables on first use and starts empty', async () => {
    const res = await call('GET', '/api/volley/ranking');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ top: [] });
  });

  it('adds the endless table to a database that only has the first migration (production today)', async () => {
    const first = readFileSync(new URL('../../migrations/0001_volley_ranking.sql', import.meta.url), 'utf8');
    const statements = first
      .replace(/--[^\n]*/g, '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    await env.DB!.batch(statements.map((s) => env.DB!.prepare(s)));
    expect((await play('Ana', 9)).status).toBe(201);
  });

  it('saves a run and ranks it by points', async () => {
    const res = await play('  Ana   Clara ', 12, 60_000);
    expect(res.status).toBe(201);
    const body = (await res.json()) as SubmitResponse;
    expect(body).toMatchObject({ points: 12, best: 12, personalBest: true, position: 1 });
    expect(body.top).toEqual([{ name: 'Ana Clara', points: 12, durationMs: 60_000, at: Date.now() }]);
  });

  it('saves a 0-point run too, below everyone who scored', async () => {
    await play('Bruno', 3);
    const res = await play('Ana', 0);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ points: 0, personalBest: true, position: 2 });
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
      const res = await submit(id, name, 5, 60_000);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: 'invalid_name', reason });
    }
    expect((await submit(id, 'Ana', 5, 60_000)).status).toBe(201);
  });

  it('refuses points the clock cannot account for', async () => {
    const id = await kickoff();
    wait(60_000);
    const expectError = async (res: Response, error: string) => {
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: string }).error).toBe(error);
    };
    await expectError(await submit(id, 'Ana', -1, 60_000), 'invalid_result');
    await expectError(await submit(id, 'Ana', 2.5, 60_000), 'invalid_result');
    // More points than 60 s of play allows…
    await expectError(await submit(id, 'Ana', 100, 60_000), 'too_fast');
    // …or a clock longer than the server has known about the run.
    await expectError(await submit(id, 'Ana', 5, 60_000 + RANKING.CLOCK_SLACK_MS + 1), 'too_fast');
    expect((await submit(id, 'Ana', 20, 60_000)).status).toBe(201);
  });

  it('accepts each ticket once, and only while it is fresh', async () => {
    const id = await kickoff();
    wait(20_000);
    expect((await submit(id, 'Ana', 1, 20_000)).status).toBe(201);
    expect((await submit(id, 'Ana', 1, 20_000)).status).toBe(404);
    expect((await submit(crypto.randomUUID(), 'Ana', 1, 20_000)).status).toBe(404);

    const stale = await kickoff();
    wait(RANKING.MATCH_TTL_MS + 1);
    expect((await submit(stale, 'Ana', 1, 20_000)).status).toBe(410);
  });

  it("keeps each player's best, merging case and accents, ties to whoever was first", async () => {
    await play('José', 10);
    await play('Bruno', 8);
    const worse = (await (await play('JOSE', 4)).json()) as SubmitResponse;
    expect(worse).toMatchObject({ points: 4, best: 10, personalBest: false, position: 1 });
    const tie = (await (await play('Carla', 10)).json()) as SubmitResponse;
    expect(tie.position).toBe(2);

    const { top } = (await (await call('GET', '/api/volley/ranking')).json()) as TopResponse;
    expect(top.map((e) => [e.name, e.points])).toEqual([
      ['José', 10],
      ['Carla', 10],
      ['Bruno', 8],
    ]);
  });

  it('shows at most the top 10', async () => {
    for (let i = 0; i < 12; i++) await play(`Player ${String.fromCharCode(65 + i)}`, i);
    const { top } = (await (await call('GET', '/api/volley/ranking')).json()) as TopResponse;
    expect(top).toHaveLength(RANKING.TOP);
    expect(top[0]).toMatchObject({ name: 'Player L', points: 11 });
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

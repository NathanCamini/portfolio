import { describe, expect, it } from 'vitest';
import { NET } from '../../src/lib/volley-online/protocol';
import worker from '../index';
import { listLive, publishLive } from '../live';
import { createD1 } from './d1';

const match = (names: [string, string], spectators = 0) => ({
  names,
  score: [2, 3] as [number, number],
  phase: 'playing' as const,
  spectators,
});

describe('live showcase (D1)', () => {
  it('lists the matches rooms publish, most watched first, and forgets the ones that ended', async () => {
    const db = createD1();
    await publishLive(db, 'AAA22', match(['Ana', 'Bia']), 1000);
    await publishLive(db, 'BBB33', match(['Caio', 'Duda'], 3), 1000);
    expect((await listLive(db, 2000, 10)).map((m) => m.code)).toEqual(['BBB33', 'AAA22']);
    await publishLive(db, 'AAA22', { ...match(['Ana', 'Bia']), score: [4, 3] }, 1500);
    expect((await listLive(db, 2000, 10)).find((m) => m.code === 'AAA22')).toMatchObject({
      names: ['Ana', 'Bia'],
      score: [4, 3],
      updatedAt: 1500,
    });
    await publishLive(db, 'BBB33', null, 1600);
    expect((await listLive(db, 2000, 10)).map((m) => m.code)).toEqual(['AAA22']);
  });

  it('hides a room that went silent (evicted mid-match), and sweeps it on the next write', async () => {
    const db = createD1();
    await publishLive(db, 'AAA22', match(['Ana', 'Bia']), 1000);
    const later = 1000 + NET.LIVE_STALE_MS + 1;
    expect(await listLive(db, later, 10)).toEqual([]);
    await publishLive(db, 'CCC44', match(['Eva', 'Fábio']), later);
    const { results } = await db.prepare('SELECT code FROM online_live').all<{ code: string }>();
    expect(results.map((r) => r.code)).toEqual(['CCC44']);
  });

  it('GET /api/volley/live serves the list, and 503 without a database', async () => {
    const db = createD1();
    await publishLive(db, 'AAA22', match(['Ana', 'Bia']), Date.now());
    const get = (env: object) =>
      worker.fetch(
        new Request('https://portfolio.test/api/volley/live') as Request<unknown, IncomingRequestCfProperties>,
        env,
      );
    const res = await get({ DB: db });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { matches: { code: string }[] }).matches.map((m) => m.code)).toEqual(['AAA22']);
    expect((await get({})).status).toBe(503);
  });
});

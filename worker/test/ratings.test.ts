import { describe, expect, it } from 'vitest';
import { ELO } from '../../src/lib/volley-online/elo';
import worker from '../index';
import { hashPlayer, ratingOf, recordResult, topRatings } from '../ratings';
import { createD1 } from './d1';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);

describe('online ratings (D1)', () => {
  it('starts everyone unrated, then saves both sides of a result', async () => {
    const db = createD1();
    expect(await ratingOf(db, A)).toBeNull();
    const changes = await recordResult(db, { pids: [A, B], names: ['Nathan', 'Maria'], winner: 0 }, 1);
    expect(changes[0]).toEqual({ before: ELO.START, after: ELO.START + ELO.K_NEW / 2 });
    expect(await ratingOf(db, A)).toBe(changes[0].after);
    expect(await ratingOf(db, B)).toBe(changes[1].after);
    expect(await topRatings(db, 10)).toEqual([
      { name: 'Nathan', rating: changes[0].after, games: 1, wins: 1 },
      { name: 'Maria', rating: changes[1].after, games: 1, wins: 0 },
    ]);
  });

  it('builds on earlier results, keeps the latest name, and logs every match', async () => {
    const db = createD1();
    await recordResult(db, { pids: [A, B], names: ['Nathan', 'Maria'], winner: 0 }, 1);
    const second = await recordResult(db, { pids: [C, A], names: ['Carla', 'Nate'], winner: 1 }, 2);
    expect(second[1].before).toBe(ELO.START + ELO.K_NEW / 2); // A's rating carried over
    const top = await topRatings(db, 10);
    expect(top[0]).toEqual({ name: 'Nate', rating: second[1].after, games: 2, wins: 2 });
    const log = await db.prepare('SELECT COUNT(*) AS n FROM online_results').first<number>('n');
    expect(log).toBe(2);
  });

  it('stores only a hash of the player id', async () => {
    const db = createD1();
    await recordResult(db, { pids: [A, B], names: ['Nathan', 'Maria'], winner: 0 }, 1);
    const { results } = await db.prepare('SELECT player FROM online_ratings').all<{ player: string }>();
    expect(results.map((r) => r.player).sort()).toEqual([await hashPlayer(A), await hashPlayer(B)].sort());
    expect(results.some((r) => r.player === A)).toBe(false);
  });

  it('GET /api/volley/ratings serves the board (and your standing), and 503 without a database', async () => {
    const db = createD1();
    await recordResult(db, { pids: [A, B], names: ['Nathan', 'Maria'], winner: 1 }, 1);
    const get = (env: object) =>
      worker.fetch(
        new Request('https://portfolio.test/api/volley/ratings') as Request<unknown, IncomingRequestCfProperties>,
        env,
      );
    const res = await get({ DB: db });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { top: { name: string }[] }).top.map((e) => e.name)).toEqual(['Maria', 'Nathan']);
    expect((await get({})).status).toBe(503);

    const mine = await worker.fetch(
      new Request(`https://portfolio.test/api/volley/ratings?me=${await hashPlayer(A)}`) as Request<
        unknown,
        IncomingRequestCfProperties
      >,
      { DB: db },
    );
    expect(((await mine.json()) as { me: unknown }).me).toMatchObject({ name: 'Nathan', position: 2, games: 1 });
  });
});

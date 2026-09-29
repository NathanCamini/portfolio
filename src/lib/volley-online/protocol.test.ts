import { describe, expect, it } from 'vitest';
import { createGame, kickoff } from '../../components/volleyball/engine/physics';
import {
  applySnapshot,
  isRoomCode,
  KEY,
  mirrorBits,
  NET,
  newRoomCode,
  normalizeRoomCode,
  packInput,
  parseClientMessage,
  ROOM_ALPHABET,
  takeSnapshot,
  unpackInput,
} from './protocol';

describe('room codes', () => {
  it('generates valid 5-character codes from the unambiguous alphabet', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 200; i++) expect(isRoomCode(newRoomCode(rng))).toBe(true);
    expect(ROOM_ALPHABET).not.toMatch(/[ILO01]/);
  });

  it('accepts what people type and rejects look-alikes', () => {
    expect(normalizeRoomCode(' abc-23 ')).toBe('ABC23');
    expect(isRoomCode('ABC23')).toBe(true);
    expect(isRoomCode('ABCO1')).toBe(false); // O and 1 never appear in a code
    expect(isRoomCode('ABC2')).toBe(false);
    expect(isRoomCode('abc23')).toBe(false);
  });
});

describe('inputs', () => {
  it('packs held keys into 3 bits and back', () => {
    for (let bits = 0; bits < 8; bits++) expect(packInput(unpackInput(bits))).toBe(bits);
    expect(packInput({ left: true, right: false, jump: true })).toBe(KEY.LEFT | KEY.JUMP);
  });

  it('mirrors left and right, keeps jump', () => {
    expect(mirrorBits(KEY.LEFT)).toBe(KEY.RIGHT);
    expect(mirrorBits(KEY.RIGHT | KEY.JUMP)).toBe(KEY.LEFT | KEY.JUMP);
    expect(mirrorBits(KEY.LEFT | KEY.RIGHT)).toBe(KEY.LEFT | KEY.RIGHT);
  });
});

describe('snapshots', () => {
  it('round-trip the simulated state (to 1/1000 px)', () => {
    const g = createGame('online');
    kickoff(g, 1);
    Object.assign(g.ball, { x: 123.456789, y: 200.1, vx: -3.33333, vy: 1.25 });
    g.score = [3, 5];
    const s = takeSnapshot(g, 42, [KEY.LEFT, KEY.JUMP]);
    expect(JSON.stringify(s).length).toBeLessThan(260);

    const copy = createGame('online');
    applySnapshot(copy, s);
    expect(copy.ball.x).toBeCloseTo(123.457, 3);
    expect(copy.ball.vx).toBeCloseTo(-3.333, 3);
    expect(copy.score).toEqual([3, 5]);
    expect(copy.phase).toBe('serve');
    expect(copy.server).toBe(1);
  });
});

describe('parseClientMessage', () => {
  const token = 'a'.repeat(32);

  it('accepts every well-formed message', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'hello', v: 1, name: 'Nathan', token }))).toEqual({
      t: 'hello',
      v: 1,
      name: 'Nathan',
      token,
    });
    expect(parseClientMessage('{"t":"ready","ready":true}')).toEqual({ t: 'ready', ready: true });
    expect(parseClientMessage('{"t":"input","tick":120,"bits":5}')).toEqual({ t: 'input', tick: 120, bits: 5 });
    expect(parseClientMessage('{"t":"ping","c":1234.5,"rtt":80}')).toEqual({ t: 'ping', c: 1234.5, rtt: 80 });
    expect(parseClientMessage('{"t":"leave"}')).toEqual({ t: 'leave' });
  });

  it('rejects anything malformed, oversized or out of range', () => {
    const bad = [
      'not json',
      '[]',
      'null',
      '{"t":"nope"}',
      '{"t":"input","tick":-1,"bits":1}',
      '{"t":"input","tick":1.5,"bits":1}',
      '{"t":"input","tick":1,"bits":8}',
      '{"t":"ready","ready":"yes"}',
      '{"t":"hello","v":1}',
      '{"t":"hello","v":1,"name":"x","token":"not-a-token"}',
      '{"t":"ping","c":"now"}',
      JSON.stringify({ t: 'hello', v: 1, name: 'x'.repeat(NET.MAX_MESSAGE_BYTES) }),
    ];
    for (const raw of bad) expect(parseClientMessage(raw), raw.slice(0, 40)).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(4))).toBeNull();
  });
});

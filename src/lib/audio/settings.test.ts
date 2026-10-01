import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A fresh module (and a fresh fake localStorage) per test: settings are read once and kept. */
async function load(saved?: string) {
  const store = new Map<string, string>(saved ? [['volley-sound', saved]] : []);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.resetModules();
  return { ...(await import('./settings')), store };
}

describe('sound settings', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('starts calm: effects on, music in the background', async () => {
    const { getSound, DEFAULT_SOUND } = await load();
    expect(getSound()).toEqual(DEFAULT_SOUND);
    expect(DEFAULT_SOUND.music).toBeLessThan(DEFAULT_SOUND.effects);
  });

  it('keeps effects and music apart, saves them, and tells listeners', async () => {
    const { getSound, setSound, subscribeSound, store } = await load();
    const heard = vi.fn();
    subscribeSound(heard);
    setSound({ music: 0 });
    expect(getSound().music).toBe(0);
    expect(getSound().effects).toBe(0.7);
    setSound({ effects: 0.3 });
    expect(JSON.parse(store.get('volley-sound')!)).toEqual({ effects: 0.3, music: 0 });
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('reads what was saved, and ignores anything odd in it', async () => {
    expect((await load('{"effects":0.2,"music":0.9}')).getSound()).toEqual({ effects: 0.2, music: 0.9 });
    expect((await load('{"effects":7,"music":"loud"}')).getSound()).toEqual({ effects: 1, music: 0.5 });
    expect((await load('not json')).getSound()).toEqual({ effects: 0.7, music: 0.5 });
  });
});

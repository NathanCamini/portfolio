import { useSyncExternalStore } from 'react';

/**
 * The sound settings: effects and music each with their own volume (0–1),
 * kept in localStorage. Read by the audio engine (lib/audio/engine.ts) and
 * the volume control in the page header.
 */
export interface SoundSettings {
  effects: number;
  music: number;
}

/** Calm by default: effects at a comfortable level, the music in the background. */
export const DEFAULT_SOUND: SoundSettings = { effects: 0.7, music: 0.5 };

const KEY = 'volley-sound';
const listeners = new Set<() => void>();
let current: SoundSettings | null = null;

const clamp = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function getSound(): SoundSettings {
  if (!current) {
    let saved: Partial<SoundSettings> = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
    } catch {
      /* nothing saved, or no storage */
    }
    current = { effects: clamp(saved.effects, DEFAULT_SOUND.effects), music: clamp(saved.music, DEFAULT_SOUND.music) };
  }
  return current;
}

export function setSound(change: Partial<SoundSettings>) {
  const now = getSound();
  current = {
    effects: clamp(change.effects ?? now.effects, now.effects),
    music: clamp(change.music ?? now.music, now.music),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: it lasts until the tab closes */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeSound(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export const useSound = () => useSyncExternalStore(subscribeSound, getSound, () => DEFAULT_SOUND);

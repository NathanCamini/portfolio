import { Music } from './music';
import { getSound, subscribeSound } from './settings';
import { playSfx, type SfxName } from './sfx';

/**
 * The game's sound: one AudioContext, two buses (effects and music, each
 * with its own volume from the sound control), and a gentle master chain —
 * a compressor that evens out peaks and a high shelf that softens the top —
 * so nothing ever comes out sharp or loud.
 *
 * Browsers only let a page make sound after the player does something, so
 * the context starts on the first click, tap or key press anywhere
 * (`installAudio`). Here, on the portfolio, the music only plays while the
 * game panel is open (`setMusicActive`), and pauses while the tab is hidden.
 */

let ac: AudioContext | null = null;
let effects: GainNode | null = null;
let musicBus: GainNode | null = null;
let music: Music | null = null;
let installed = false;
/** The game panel is open: the only time the portfolio plays music. */
let musicActive = false;
/** Last time each effect played: the same one again within MIN_GAP_MS is skipped (no machine-gun clicks). */
const lastPlayed = new Map<string, number>();
const MIN_GAP_MS = 90;

/** Volume slider (0–1) to gain: squared, so the slider feels even to the ear. */
const loudness = (v: number) => v * v;

function build(): AudioContext | null {
  if (ac) return ac;
  const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined;
  if (!Ctor) return null;
  ac = new Ctor({ latencyHint: 'interactive' });
  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 14;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;
  const soften = ac.createBiquadFilter();
  soften.type = 'highshelf';
  soften.frequency.value = 6000;
  soften.gain.value = -4;
  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(compressor).connect(soften).connect(ac.destination);
  effects = ac.createGain();
  musicBus = ac.createGain();
  effects.connect(master);
  musicBus.connect(master);
  music = new Music(ac, musicBus);
  applyVolumes(true);
  return ac;
}

function applyVolumes(now = false) {
  if (!ac || !effects || !musicBus) return;
  const s = getSound();
  const t = ac.currentTime;
  for (const [bus, v] of [
    [effects, s.effects],
    [musicBus, s.music],
  ] as const) {
    bus.gain.cancelScheduledValues(t);
    if (now) bus.gain.setValueAtTime(loudness(v), t);
    else bus.gain.setTargetAtTime(loudness(v), t, 0.05);
  }
  syncMusic();
}

/** Music plays when it's on, the page is visible and sound has been unlocked. */
function syncMusic() {
  if (!ac || !music) return;
  const want = musicActive && getSound().music > 0 && document.visibilityState === 'visible' && ac.state === 'running';
  if (want && !music.playing) music.start();
  else if (!want && music.playing) music.stop();
}

function unlock() {
  const ctx = build();
  if (!ctx) return;
  if (ctx.state !== 'running') void ctx.resume().then(syncMusic);
  else syncMusic();
}

/** Call once from the page: wires the first-gesture unlock, the volume settings and tab visibility. */
export function installAudio() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
  subscribeSound(() => applyVolumes());
  document.addEventListener('visibilitychange', syncMusic);
}

/** The game panel opened (true) or closed (false): the music follows, and sound unlocks if it can. */
export function setMusicActive(active: boolean) {
  musicActive = active;
  if (active) unlock();
  else syncMusic();
}

/** Plays an effect (ignored before the first gesture, at volume 0, or right after the same one). */
export function sfx(name: SfxName, amount = 0.5) {
  if (!ac || ac.state !== 'running' || !effects || getSound().effects === 0) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < MIN_GAP_MS) return;
  lastPlayed.set(name, now);
  playSfx(ac, effects, name, ac.currentTime + 0.005, amount);
}

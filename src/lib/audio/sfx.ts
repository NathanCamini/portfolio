/**
 * The sound effects, synthesized on the spot with Web Audio: no files to
 * download, nothing to license. Every one is soft by design: sine and
 * triangle waves, gentle attacks, a low-pass to take the edge off, and a
 * level chosen so they all sit at about the same loudness (see
 * `SFX_LEVELS`; the same sounds as the full game, NathanCamini/volleyball_game).
 *
 * A recipe draws into `out` starting at time `t`; `amount` (0–1) lets a
 * stronger hit sound a little fuller.
 */
export type SfxName =
  | 'jump'
  | 'hit'
  | 'net'
  | 'wall'
  | 'pointWin'
  | 'pointLose'
  | 'point'
  | 'emote'
  | 'power'
  | 'powerReady'
  | 'found'
  | 'tick'
  | 'go'
  | 'win'
  | 'lose';

type Ctx = BaseAudioContext;
type Recipe = (ac: Ctx, out: AudioNode, t: number, amount: number) => void;

interface Tone {
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency over the sound (exponential). */
  to?: number;
  dur: number;
  attack?: number;
  gain: number;
  /** Low-pass cutoff (Hz). */
  cutoff?: number;
  delay?: number;
}

/** One soft note: oscillator → low-pass → envelope (quick fade in, smooth fade out). */
function tone(ac: Ctx, out: AudioNode, t: number, o: Tone) {
  const start = t + (o.delay ?? 0);
  const end = start + o.dur;
  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, start);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, end);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = o.cutoff ?? 3200;
  const env = ac.createGain();
  const attack = o.attack ?? 0.008;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(o.gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(lp).connect(env).connect(out);
  osc.start(start);
  osc.stop(end + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;
/** A short burst of filtered noise: the "air" in a touch or a thud. */
function noise(ac: Ctx, out: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ac.sampleRate) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = 0.8;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(env).connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** Note names to Hz (A4 = 440). */
const hz = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
const C5 = hz(3);
const D5 = hz(5);
const E5 = hz(7);
const G5 = hz(10);
const A5 = hz(12);
const B5 = hz(14);
const C6 = hz(15);
const E6 = hz(19);
const A4 = hz(0);
const E4 = hz(-5);
const C4 = hz(-9);

/** A little bell: the note plus a quiet octave-and-a-fifth partial, long soft tail. */
function bell(ac: Ctx, out: AudioNode, t: number, freq: number, gain: number, dur = 0.7, delay = 0) {
  tone(ac, out, t, { freq, dur, gain, delay, attack: 0.006, cutoff: 4000 });
  tone(ac, out, t, { freq: freq * 3, dur: dur * 0.5, gain: gain * 0.12, delay, cutoff: 5000 });
}

const RECIPES: Record<SfxName, Recipe> = {
  // A soft upward "boing".
  jump: (ac, out, t) => tone(ac, out, t, { type: 'triangle', freq: 300, to: 520, dur: 0.14, gain: 0.5, cutoff: 1800 }),
  // The ball touching a body: a round low pop with a breath of air; a bit brighter when it's hit hard.
  hit: (ac, out, t, a) => {
    tone(ac, out, t, { freq: 210 + a * 60, to: 120, dur: 0.11, gain: 0.75, cutoff: 1400 });
    noise(ac, out, t, 0.04, 0.12 + a * 0.08, 'bandpass', 1400 + a * 600);
  },
  // Into the net: a muffled thud.
  net: (ac, out, t) => {
    tone(ac, out, t, { freq: 110, to: 70, dur: 0.16, gain: 0.6, cutoff: 500 });
    noise(ac, out, t, 0.1, 0.12, 'lowpass', 700);
  },
  wall: (ac, out, t) => {
    tone(ac, out, t, { freq: 150, to: 95, dur: 0.1, gain: 0.45, cutoff: 700 });
    noise(ac, out, t, 0.05, 0.08, 'lowpass', 900);
  },
  // A point for you: two rising bell notes.
  pointWin: (ac, out, t) => {
    bell(ac, out, t, E5, 0.32);
    bell(ac, out, t, B5, 0.3, 0.8, 0.11);
  },
  // A point against: two gentle falling notes, never harsh.
  pointLose: (ac, out, t) => {
    tone(ac, out, t, { type: 'triangle', freq: A4, dur: 0.32, gain: 0.34, cutoff: 1500 });
    tone(ac, out, t, { type: 'triangle', freq: E4, dur: 0.45, gain: 0.34, cutoff: 1300, delay: 0.14 });
  },
  // Spectators: just a soft chime, nobody's side.
  point: (ac, out, t) => bell(ac, out, t, G5, 0.3, 0.6),
  // A bubble pop.
  emote: (ac, out, t) => tone(ac, out, t, { freq: 520, to: 880, dur: 0.09, gain: 0.45, cutoff: 2600 }),
  // A power fired: a quick shimmer up.
  power: (ac, out, t) => {
    [C5, E5, G5, C6].forEach((f, i) =>
      tone(ac, out, t, { freq: f, dur: 0.22, gain: 0.2, delay: i * 0.045, cutoff: 3500 }),
    );
    noise(ac, out, t, 0.25, 0.03, 'highpass', 5000);
  },
  // A power arrived in your hand: one small sparkle.
  powerReady: (ac, out, t) => {
    bell(ac, out, t, A5, 0.2, 0.4);
    bell(ac, out, t, E6, 0.12, 0.35, 0.07);
  },
  // Someone to play with: a bright, friendly arpeggio — the one sound meant to reach you in another tab.
  found: (ac, out, t) => {
    [C5, E5, G5, C6].forEach((f, i) => bell(ac, out, t, f, 0.34, 0.9, i * 0.12));
  },
  // Countdown: soft woodblock ticks, then a higher one for the start.
  tick: (ac, out, t) => tone(ac, out, t, { freq: 880, dur: 0.07, gain: 0.32, cutoff: 2400 }),
  go: (ac, out, t) => bell(ac, out, t, C6, 0.32, 0.5),
  // End of the match.
  win: (ac, out, t) => {
    [C5, E5, G5, C6, E6].forEach((f, i) => bell(ac, out, t, f, 0.28, 1.1, i * 0.1));
  },
  lose: (ac, out, t) => {
    [E5, D5, C5].forEach((f, i) =>
      tone(ac, out, t, { type: 'triangle', freq: f, dur: 0.5, gain: 0.26, cutoff: 1600, delay: i * 0.18 }),
    );
    tone(ac, out, t, { freq: C4, dur: 0.9, gain: 0.2, cutoff: 900, delay: 0.36 });
  },
};

export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

/**
 * Per-effect trim, from rendering every effect offline and measuring its
 * loudness (RMS over its audible part; measured in the full game): the
 * in-game ones that repeat all the time (jump, hit, net, wall, emote, tick,
 * powerReady) at −23 dB, the moments (points, powers, countdown start, end
 * of match) at −20 dB, and "found" at −18 dB, to reach you in another tab.
 * The loudest peak is −5 dBFS: nothing clips, nothing jumps out.
 */
export const SFX_LEVELS: Record<SfxName, number> = {
  jump: 0.842,
  hit: 0.372,
  net: 0.529,
  wall: 0.638,
  pointWin: 0.923,
  pointLose: 1.23,
  point: 1.059,
  emote: 0.665,
  power: 1.413,
  powerReady: 1.146,
  found: 0.871,
  tick: 0.984,
  go: 1.072,
  win: 0.716,
  lose: 1.303,
};

export function playSfx(ac: Ctx, out: AudioNode, name: SfxName, t: number, amount = 0.5) {
  const trim = ac.createGain();
  trim.gain.value = SFX_LEVELS[name];
  trim.connect(out);
  RECIPES[name](ac, trim, t, Math.min(1, Math.max(0, amount)));
}

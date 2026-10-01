/**
 * The background music: a calm lo-fi loop played live with Web Audio, never
 * a file. Soft pads on a four-chord progression, a round bass, and a sparse
 * pentatonic melody through a little echo and room, at 72 bpm. The melody is
 * redrawn every four bars from a seeded generator, so it keeps changing
 * without ever getting busy.
 *
 * `scheduleBar` is pure scheduling (it also drives the offline loudness
 * check); `Music` runs it a little ahead of time while the tab is visible.
 */

const BPM = 72;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Dmaj9 · Bm9 · Gmaj9 · A6sus — warm, unresolved, easy to listen to forever. */
const CHORDS: number[][] = [
  [50, 57, 61, 64, 66],
  [47, 57, 62, 66, 69],
  [43, 54, 59, 62, 69],
  [45, 52, 57, 61, 66],
];
/** D major pentatonic, one octave and a bit, for the melody. */
const SCALE = [74, 76, 78, 81, 83, 86, 88];

export interface Room {
  /** Where the dry sound goes. */
  dry: AudioNode;
  /** The echo + room send (melody only). */
  wet: AudioNode;
}

/** Builds the effects: a soft echo and a generated room reverb, both into `out`. */
export function makeRoom(ac: BaseAudioContext, out: AudioNode): Room {
  const dry = ac.createGain();
  dry.connect(out);

  const wet = ac.createGain();
  wet.gain.value = 0.5;
  const delay = ac.createDelay(2);
  delay.delayTime.value = BEAT * 0.75;
  const feedback = ac.createGain();
  feedback.gain.value = 0.28;
  const tone = ac.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2200;
  wet.connect(delay).connect(tone).connect(feedback).connect(delay);

  const reverb = ac.createConvolver();
  const len = Math.floor(ac.sampleRate * 2.4);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  let seed = 11;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / len) ** 3;
    }
  }
  reverb.buffer = ir;
  const reverbLevel = ac.createGain();
  reverbLevel.gain.value = 0.35;
  wet.connect(reverb);
  tone.connect(reverb);
  reverb.connect(reverbLevel).connect(out);
  tone.connect(out);
  return { dry, wet };
}

function voice(
  ac: BaseAudioContext,
  out: AudioNode,
  t: number,
  freq: number,
  dur: number,
  o: { type: OscillatorType; gain: number; attack: number; cutoff: number; detune?: number },
) {
  const osc = ac.createOscillator();
  osc.type = o.type;
  osc.frequency.value = freq;
  osc.detune.value = o.detune ?? 0;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = o.cutoff;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(o.gain, t + o.attack);
  env.gain.setValueAtTime(o.gain, Math.max(t + o.attack, t + dur - o.attack));
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(lp).connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** A small seeded generator (so the melody is varied, not random noise). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** A melody for four bars: notes on eighths, mostly steps, plenty of rests. */
function phrase(seed: number): (number | null)[] {
  const r = rng(seed);
  const notes: (number | null)[] = [];
  let i = Math.floor(r() * 3) + 1;
  for (let k = 0; k < 32; k++) {
    // Rest more often on off-beats and at the end of each two bars.
    const rest = r() < (k % 2 ? 0.75 : 0.5) || k % 16 > 13;
    if (rest) {
      notes.push(null);
      continue;
    }
    i = Math.max(0, Math.min(SCALE.length - 1, i + Math.floor(r() * 5) - 2));
    notes.push(SCALE[i]);
  }
  return notes;
}

/** Schedules bar number `n` (from the start of the music) at time `t`. */
export function scheduleBar(ac: BaseAudioContext, room: Room, n: number, t: number) {
  const chord = CHORDS[n % CHORDS.length];
  // Pad: the chord's upper notes, two slightly detuned voices each, slow in and out.
  for (const m of chord.slice(1)) {
    for (const detune of [-6, 6]) {
      voice(ac, room.dry, t, hz(m), BAR + 0.6, { type: 'triangle', gain: 0.022, attack: 0.9, cutoff: 1100, detune });
    }
  }
  // Bass: the root, on beats 1 and 3.
  for (const beat of [0, 2]) {
    voice(ac, room.dry, t + beat * BEAT, hz(chord[0] - 12), BEAT * 1.6, {
      type: 'sine',
      gain: 0.13,
      attack: 0.02,
      cutoff: 400,
    });
  }
  // Melody: this bar's eighths of the current four-bar phrase, plucked and sent to the echo.
  const notes = phrase(1000 + Math.floor(n / 4));
  for (let e = 0; e < 8; e++) {
    const m = notes[(n % 4) * 8 + e];
    if (m === null) continue;
    const at = t + (e * BEAT) / 2 + (e % 2 ? BEAT * 0.06 : 0); // a little swing
    voice(ac, room.wet, at, hz(m), 0.55, { type: 'sine', gain: 0.05, attack: 0.008, cutoff: 2400 });
    voice(ac, room.dry, at, hz(m), 0.55, { type: 'sine', gain: 0.035, attack: 0.008, cutoff: 2400 });
  }
}

/** Plays the music while started: schedules bars ~1 s ahead, fades in and out. */
export class Music {
  private readonly out: GainNode;
  private readonly room: Room;
  private timer: ReturnType<typeof setInterval> | null = null;
  private bar = 0;
  private nextAt = 0;

  constructor(
    private readonly ac: AudioContext,
    destination: AudioNode,
  ) {
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this.room = makeRoom(ac, this.out);
  }

  get playing() {
    return this.timer !== null;
  }

  start() {
    if (this.timer) return;
    const now = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(1, now + 2.5);
    this.nextAt = Math.max(this.nextAt, now + 0.1);
    const tick = () => {
      while (this.nextAt < this.ac.currentTime + 1.2) {
        scheduleBar(this.ac, this.room, this.bar++, this.nextAt);
        this.nextAt += BAR;
      }
    };
    tick();
    this.timer = setInterval(tick, 250);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    const now = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 0.8);
    // Bars already scheduled play out under the fade; start again after them.
    this.nextAt = Math.max(this.nextAt, now + 0.9);
  }
}

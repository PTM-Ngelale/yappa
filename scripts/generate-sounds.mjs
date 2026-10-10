// Synthesises Yappa's placeholder sound effects and music loops into assets/audio/*.wav.
// Everything is generated from scratch (no samples), so there are no licensing concerns.
// To use real audio instead, drop a file with the same name into assets/audio/ — or change
// the require() paths in src/audio/sounds.ts — and don't re-run this script.
//
// Run: npm run sounds
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio');
const SR = 22050;
const TAU = Math.PI * 2;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// Deterministic noise so re-running produces identical files.
let seed = 12345;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

const WAVES = {
  sine: (p) => Math.sin(p),
  tri: (p) => (2 / Math.PI) * Math.asin(Math.sin(p)),
  soft: (p) => Math.tanh(2.2 * Math.sin(p)),
};

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * SR));

/**
 * Adds one note to `out`. With `decay` set the note fades exponentially (plucks, bells);
 * otherwise it holds for `dur` and then fades over `release`.
 */
function tone(out, { at, dur, freq, freqEnd = freq, vol = 0.5, attack = 0.005, release = 0.05, decay = 0, wave = 'sine', vibrato = 0 }) {
  const start = Math.floor(at * SR);
  const n = Math.floor((dur + release) * SR);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= out.length) break;
    const t = i / SR;
    const f = freq + (freqEnd - freq) * Math.min(1, t / dur);
    phase += (TAU * f * (1 + vibrato * Math.sin(TAU * 5.5 * t))) / SR;
    let e = t < attack ? t / attack : 1;
    if (decay > 0) e *= Math.exp(-Math.max(0, t - attack) / decay);
    if (t > dur) e *= Math.max(0, 1 - (t - dur) / release);
    out[idx] += WAVES[wave](phase) * e * vol;
  }
}

/** A soft bell / music-box note: a few inharmonic partials, the higher ones dying faster. */
function bell(out, at, note, vol = 0.4, decay = 0.5) {
  const partials = [[1, 1, 1], [2, 0.45, 0.55], [3.01, 0.2, 0.35], [4.17, 0.08, 0.2]];
  for (const [ratio, amp, life] of partials) {
    const d = decay * life;
    tone(out, { at, dur: d * 5, freq: midi(note) * ratio, vol: vol * amp, attack: 0.002, decay: d, release: 0.01 });
  }
}

/** Filtered noise burst — hats, shakers, snare body. `bright` 0..1 picks high- vs low-passed. */
function noiseHit(out, at, { vol = 0.1, decay = 0.03, bright = 1 }) {
  const start = Math.floor(at * SR);
  const n = Math.floor(decay * 6 * SR);
  let prev = 0;
  let low = 0;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= out.length) break;
    const x = noise();
    const high = x - prev; // crude high-pass
    prev = x;
    low += 0.2 * (x - low); // crude low-pass
    const s = bright * high + (1 - bright) * low;
    out[idx] += s * Math.exp(-i / SR / decay) * vol;
  }
}

function kick(out, at, vol = 0.6) {
  tone(out, { at, dur: 0.16, freq: 150, freqEnd: 48, vol, attack: 0.002, decay: 0.09, release: 0.02 });
}

function lowpass(data, amount) {
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += amount * (data[i] - y);
    data[i] = y;
  }
  return data;
}

function mix(into, from, gain = 1) {
  for (let i = 0; i < into.length && i < from.length; i++) into[i] += from[i] * gain;
  return into;
}

/** Renders `seconds` of audio plus a tail, then folds the tail back onto the start so the loop is seamless. */
function renderLoop(seconds, tail, draw) {
  const full = buffer(seconds + tail);
  draw(full);
  const length = Math.round(seconds * SR);
  const loop = full.slice(0, length);
  for (let i = length; i < full.length; i++) loop[i - length] += full[i];
  return loop;
}

function writeWav(name, data, peak = 0.85) {
  let max = 0;
  for (const s of data) max = Math.max(max, Math.abs(s));
  const gain = max > 0 ? peak / max : 1;
  const pcm = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i] * gain));
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.wav`), Buffer.concat([header, pcm]));
  console.log(`  ${name}.wav  ${(data.length / SR).toFixed(2)}s`);
}

/** Tiny fade at both ends of a one-shot so it doesn't click (loops are already continuous). */
function fadeEdges(data, seconds = 0.004) {
  const n = Math.min(Math.floor(seconds * SR), data.length / 2);
  for (let i = 0; i < n; i++) {
    data[i] *= i / n;
    data[data.length - 1 - i] *= i / n;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

const sfx = {
  // Any button press — short, soft, high "tock".
  tap() {
    const b = buffer(0.07);
    tone(b, { at: 0, dur: 0.03, freq: 1250, freqEnd: 750, vol: 0.6, attack: 0.001, decay: 0.018, release: 0.03 });
    return b;
  },
  // A word lands in the chain — bubbly upward pop.
  pop() {
    const b = buffer(0.14);
    tone(b, { at: 0, dur: 0.07, freq: 360, freqEnd: 1050, vol: 0.7, attack: 0.003, decay: 0.045, release: 0.05 });
    return b;
  },
  // It's your turn — two quick bell notes.
  yourTurn() {
    const b = buffer(0.9);
    bell(b, 0, 88, 0.4, 0.3);
    bell(b, 0.09, 95, 0.45, 0.4);
    return b;
  },
  // New round — rising four-note arpeggio.
  roundStart() {
    const b = buffer(1.3);
    [84, 88, 91, 96].forEach((n, i) => bell(b, i * 0.08, n, 0.35, i === 3 ? 0.55 : 0.3));
    return b;
  },
  // Someone joined the lobby.
  join() {
    const b = buffer(0.9);
    bell(b, 0, 79, 0.4, 0.35);
    bell(b, 0.1, 86, 0.45, 0.45);
    return b;
  },
  // Someone left the lobby.
  leave() {
    const b = buffer(0.9);
    bell(b, 0, 86, 0.4, 0.3);
    bell(b, 0.1, 79, 0.4, 0.4);
    return b;
  },
  // Last seconds of a turn — woodblock tick.
  tick() {
    const b = buffer(0.08);
    tone(b, { at: 0, dur: 0.02, freq: 1300, vol: 0.6, attack: 0.001, decay: 0.022, release: 0.03 });
    tone(b, { at: 0, dur: 0.02, freq: 2650, vol: 0.2, attack: 0.001, decay: 0.012, release: 0.03 });
    return b;
  },
  // Rejected input (shake) — soft double buzz.
  error() {
    const b = buffer(0.32);
    for (const at of [0, 0.13]) {
      tone(b, { at, dur: 0.08, freq: 180, freqEnd: 150, vol: 0.35, wave: 'soft', attack: 0.004, release: 0.03 });
    }
    return lowpass(b, 0.35);
  },
  // Team guessed it — bright arpeggio into a held chord with sparkles.
  win() {
    const b = buffer(2.0);
    [72, 76, 79, 84].forEach((n, i) => bell(b, i * 0.09, n, 0.35, 0.35));
    for (const n of [84, 88, 91]) bell(b, 0.42, n, 0.3, 0.9);
    bell(b, 0.55, 100, 0.12, 0.3);
    bell(b, 0.63, 103, 0.1, 0.3);
    return b;
  },
  // Wrong guess / time's up — gentle descending "aww".
  lose() {
    const b = buffer(1.4);
    tone(b, { at: 0, dur: 0.2, freq: midi(67), vol: 0.35, wave: 'tri', attack: 0.02, release: 0.06 });
    tone(b, { at: 0.26, dur: 0.2, freq: midi(66), vol: 0.35, wave: 'tri', attack: 0.02, release: 0.06 });
    tone(b, { at: 0.52, dur: 0.55, freq: midi(65), freqEnd: midi(64.3), vol: 0.35, wave: 'tri', attack: 0.02, release: 0.25, vibrato: 0.012 });
    return lowpass(b, 0.4);
  },
  // Final results — short fanfare.
  gameOver() {
    const b = buffer(3.0);
    const chords = [[72, 76, 79], [77, 81, 84], [79, 83, 86]];
    chords.forEach((chord, i) => chord.forEach((n) => bell(b, i * 0.22, n, 0.25, 0.3)));
    [84, 88, 91, 96].forEach((n) => bell(b, 0.7, n, 0.25, 1.1));
    [96, 100, 103, 108].forEach((n, i) => bell(b, 0.8 + i * 0.07, n, 0.08, 0.3));
    return b;
  },
};

// ---------------------------------------------------------------------------
// Music loops
// ---------------------------------------------------------------------------

/** Menu / lobby: calm, 90 bpm, music-box arpeggios over a soft pad. */
function menuMusic() {
  const beat = 60 / 90;
  const bar = beat * 4;
  const progression = [
    { bass: 48, tones: [60, 64, 67, 71] }, // Cmaj7
    { bass: 45, tones: [57, 60, 64, 67] }, // Am7
    { bass: 41, tones: [57, 60, 64, 65] }, // Fmaj7
    { bass: 43, tones: [55, 59, 62, 64] }, // G6
  ];
  const bars = 8;
  return renderLoop(bars * bar, 1.5, (out) => {
    const pad = buffer(out.length / SR);
    for (let b = 0; b < bars; b++) {
      const { bass, tones } = progression[b % progression.length];
      const t0 = b * bar;
      for (const n of tones) {
        tone(pad, { at: t0, dur: bar - 0.2, freq: midi(n), vol: 0.07, wave: 'tri', attack: 0.5, release: 0.9 });
        tone(pad, { at: t0, dur: bar - 0.2, freq: midi(n) * 1.004, vol: 0.05, attack: 0.5, release: 0.9 });
      }
      tone(out, { at: t0, dur: beat * 1.8, freq: midi(bass), vol: 0.22, attack: 0.02, release: 0.3 });
      tone(out, { at: t0 + beat * 2, dur: beat * 1.8, freq: midi(bass), vol: 0.18, attack: 0.02, release: 0.3 });
      const pattern = b % 2 === 0 ? [0, 2, 1, 3, 2, 1, 3, 2] : [3, 2, 0, 2, 1, 3, 1, 2];
      pattern.forEach((p, i) => bell(out, t0 + i * (beat / 2), tones[p] + 12, i % 2 === 0 ? 0.13 : 0.09, 0.35));
      for (let i = 0; i < 8; i++) if (i % 2 === 1) noiseHit(out, t0 + i * (beat / 2), { vol: 0.025, decay: 0.03 });
    }
    mix(out, lowpass(pad, 0.12));
  });
}

/** In-game: upbeat, 118 bpm, pulsing bass, light drums and bell arpeggios. */
function gameMusic() {
  const beat = 60 / 118;
  const bar = beat * 4;
  const progression = [
    { bass: 45, tones: [57, 60, 64] }, // Am
    { bass: 41, tones: [53, 57, 60] }, // F
    { bass: 48, tones: [55, 60, 64] }, // C
    { bass: 43, tones: [55, 59, 62] }, // G
  ];
  const bars = 16;
  return renderLoop(bars * bar, 1.2, (out) => {
    const pad = buffer(out.length / SR);
    const eighth = beat / 2;
    for (let b = 0; b < bars; b++) {
      const { bass, tones } = progression[b % progression.length];
      const t0 = b * bar;
      const secondHalf = b >= 8;
      for (const n of tones) {
        tone(pad, { at: t0, dur: bar - 0.1, freq: midi(n), vol: 0.06, wave: 'tri', attack: 0.15, release: 0.4 });
      }
      for (let i = 0; i < 8; i++) {
        const t = t0 + i * eighth;
        // Bass: octave-bouncing eighths.
        tone(out, { at: t, dur: eighth * 0.8, freq: midi(bass + (i % 2 ? 12 : 0)), vol: 0.22, wave: 'tri', attack: 0.004, decay: 0.12, release: 0.04 });
        // Hats on every eighth, accented off-beats.
        noiseHit(out, t, { vol: i % 2 ? 0.05 : 0.025, decay: 0.018 });
      }
      for (const k of [0, 2]) kick(out, t0 + k * beat, 0.55);
      if (secondHalf) kick(out, t0 + 3.5 * beat, 0.35);
      for (const s of [1, 3]) {
        noiseHit(out, t0 + s * beat, { vol: 0.14, decay: 0.06, bright: 0.55 });
        tone(out, { at: t0 + s * beat, dur: 0.05, freq: 210, freqEnd: 170, vol: 0.12, decay: 0.04, release: 0.02 });
      }
      // Bell arpeggio — sparser in the first half, busier and higher in the second.
      const notes = [...tones, tones[1] + 12];
      const pattern = secondHalf ? [0, 1, 2, 3, 2, 3, 1, 2] : [0, -1, 2, -1, 1, -1, 3, -1];
      pattern.forEach((p, i) => {
        if (p >= 0) bell(out, t0 + i * eighth, notes[p] + (secondHalf ? 24 : 12), i % 2 ? 0.08 : 0.11, 0.25);
      });
    }
    mix(out, lowpass(pad, 0.1));
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`Writing to ${OUT_DIR}`);
for (const [name, make] of Object.entries(sfx)) writeWav(name, fadeEdges(make()));
writeWav('music_menu', menuMusic(), 0.8);
writeWav('music_game', gameMusic(), 0.8);

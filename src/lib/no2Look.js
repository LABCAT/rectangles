/**
 * no2Look — seed → look for #RectanglesNo2 (the neon tube tunnel).
 *
 * Pure: seed in, plain values out, no p5 and no browser globals, so the lab's
 * `pnpm seed:table` can list seeds from Node. Ranges are tight on purpose:
 * every seed should land somewhere good; variety comes from combining a few
 * strong picks (structure first — lanes, frame shape, hero form, ring), then
 * a seeded hue + harmony for colour (never a fixed palette list).
 *
 * Draw order is part of the contract: every rng call shifts the values after
 * it. Add new params at the END (or on their own salted stream) so existing
 * seeds keep their look.
 */

import { createRng, seedToInt, mulberry32 } from './reelParams.js';

export const TRACK_BPM = 115;

/**
 * Reel parts on bar lines (1-based, inclusive; 115 bpm → 2.087s a bar):
 *   a  bars  5–12  build      16.7s  drum lanes + melody slams opening up
 *   b  bars 13–16  drop        8.3s  the hero lead lights up dead centre
 *   c  bars 17–20  ring        8.3s  Synth 1 torus spins up round the hero, Fifth Drops joins on bar 20
 *   d  bars 21–24  peak        8.3s  torus + corridor + hero + drums, everything on
 *   e  bars 25–33  breakdown  18.8s  drums out, corridor + hero, fade to black
 */
export const NO2_PARTS = {
  a: { bars: [5, 12], title: 'Build' },
  b: { bars: [13, 16], title: 'Drop' },
  c: { bars: [17, 20], title: 'Ring' },
  d: { bars: [21, 24], title: 'Peak' },
  e: { bars: [25, 33], title: 'Breakdown' },
};

const wrapHue = (h) => ((h % 360) + 360) % 360;

/** HSB (0–360, 0–100, 0–100) → [r, g, b] 0–255. */
export const hsbToRgb = (h, s, b) => {
  const hh = wrapHue(h) / 60;
  const ss = Math.min(1, Math.max(0, s / 100));
  const v = Math.min(1, Math.max(0, b / 100));
  const c = v * ss;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r, g, bl] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return [r, g, bl].map((u) => Math.round((u + m) * 255));
};

export const rgbToHex = (rgb) => `#${rgb.map((u) => u.toString(16).padStart(2, '0')).join('')}`;

const HARMONY = { complement: 180, split: 150, triad: 120 };
const ASPECT = { wide: 1.43, square: 1, tall: 0.7 };

/**
 * @param {string|number} seed
 * @param {{ bpm?: number, beats?: number, speed?: number }} [opts]
 *   bpm: motion tempo (default the track's 115); beats: flyer travel in beats
 *   (default 16 = 4 bars, the original tunnel length); speed: rotation multiplier.
 */
export const createNo2Look = (seed, { bpm = TRACK_BPM, beats = 16, speed = 1 } = {}) => {
  const rng = createRng(seed);
  const { range, pick } = rng;

  // --- Colour: one seeded hue, one harmony for the second voice.
  const hue = range(0, 360);
  const harmony = pick(['complement', 'complement', 'split', 'triad']);
  const hue2 = wrapHue(hue + HARMONY[harmony] * pick([1, -1]));

  // --- Structure.
  // Drum lanes: kicks/snares rise out of the bottom corners (the original),
  // mirror top/bottom corners, or run as side rails at mid-height.
  const lanes = pick(['corners', 'corners', 'mirror', 'rails']);
  const frame = pick(['wide', 'wide', 'square', 'tall']);
  const tube = pick([1, 1, 1.8]);
  // Hero lead: 6-face neon cube (original), 3-ring gyroscope, or nested frames.
  const hero = pick(['cube', 'cube', 'gyro', 'nest']);
  // Synth 1 torus: a ring of rectangular cross-sections around the hero.
  const ringFrames = pick([8, 12, 18]);
  const ringTilt = pick([0, 0.45, 0.9]);
  // Melody slams: echo outlines per stab.
  const slamLayers = pick([1, 2, 3]);
  // Fifth Drops corridor: one frame per note, or a nested triple.
  const drops = pick([1, 1, 3]);
  // Background recipe behind the blackout sheet.
  const bg = pick(['conic', 'film', 'duo']);
  // Camera: a small roll on some seeds; rotation direction.
  const roll = pick([0, 0, 0.12, -0.12]);
  const spin = pick([1, -1]);
  // Chroma tunnel background (appended: earlier picks keep their draws).
  const tunnelRings = pick([14, 18, 24]);
  const tunnelRate = pick([0.5, 1, 1]); // rings a beat
  const tunnelSat = range(72, 92);

  const kick = hsbToRgb(hue, 67, 100);
  const snare = hsbToRgb(hue2, 72, 100);

  return {
    seed: String(seed),
    bpm,
    beats,
    speed,
    loopSec: (beats * 60) / bpm,
    hue,
    hue2,
    harmony,
    lanes,
    frame,
    frameAspect: ASPECT[frame],
    tube,
    hero,
    ringFrames,
    ringTilt,
    slamLayers,
    drops,
    bg,
    roll,
    spin,
    tunnelRings,
    tunnelRate,
    tunnelSat,
    kick,
    snare,
    // seed-table reads the opening colour from palettes[0].hue
    palettes: [{ hue, hue2, kick: rgbToHex(kick), snare: rgbToHex(snare) }],
  };
};

/** Melody (track 8) hue: pitch climbs the wheel, rotated so it starts on the look's hue. */
export const melodyHue = (look, midi) => {
  const t = Math.min(1, Math.max(0, (midi - 36) / 36));
  return wrapHue(look.hue + t * 360);
};

/** Hero (track 7) hue: pitch CLASS, so the octave-up lead reads as the same tune. */
export const pitchClassHue = (look, midi) => wrapHue(look.hue + (midi % 12) * 30);

/**
 * A reproducible sub-stream for per-event choices (e.g. the n-th background),
 * so per-event draws never shift the look's own params.
 */
export const eventRng = (seed, salt, index) => {
  const random = mulberry32((seedToInt(seed) ^ Math.imul(salt + 1, 0x85ebca6b) ^ Math.imul(index + 1, 0x27d4eb2f)) >>> 0);
  for (let i = 0; i < 4; i++) random();
  const range = (min = 0, max = 1) => min + (max - min) * random();
  return { random, range };
};

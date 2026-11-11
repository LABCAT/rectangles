/**
 * no4Look — seed → look for #RectanglesNo4 (psychedelic WebGL Mondrian).
 *
 * Pure ES module (no p5, no browser globals) so the lab's `pnpm seed:table`
 * can list seeds from plain Node. Every `u*` value becomes a shader uniform
 * in src/shaders/no4Mondrian.frag; scalars can be overridden with `?uX=`.
 *
 * Structure first (ARA ledger §13): layout (flat / portal zoom), fold
 * (none / mirror / quad / mirrored tiles), density, grid snap, line weight and
 * light mode are either/or picks that read in 5 seconds; colour comes from a
 * seeded hue + harmony on its own salted stream, so palette changes never
 * reshuffle structure. Ranges are tight on purpose — every seed should land
 * somewhere good — and a density budget (ledger §1) caps busy combinations.
 *
 * The track is a copy of #RectanglesNo3's (112 BPM, 4/4, 28 bars). Motion
 * keys off `bpm` (the ?bpm= param, else NO4_DEFAULT_BPM = the track's). Beat-locked events (line moves, colour cycling,
 * subdivision builds) land on beats/bars of that tempo; `speed` scales only
 * the continuous motion (portal zoom, stretch drift).
 */

import { mulberry32, seedToInt, resolvePart } from './reelParams.js';

export const NO4_DEFAULT_BPM = 112;

/**
 * Parts: the track's seven 4-bar phrases (the same cuts as #RectanglesNo3's
 * NO3_PARTS), bar 1 at t = 0. At 112 bpm a part is 8.57s.
 * `energy` scales the beat pump / warp so the sections differ.
 */
export const NO4_PARTS = {
  a: { bars: [1, 4], name: 'Riffs', energy: 0.6 },
  b: { bars: [5, 8], name: 'Clavinet', energy: 0.7 },
  c: { bars: [9, 12], name: 'Bass', energy: 0.8 },
  d: { bars: [13, 16], name: 'Bounce', energy: 0.9 },
  e: { bars: [17, 20], name: 'Drums', energy: 1 },
  f: { bars: [21, 24], name: 'Wheeler', energy: 1 },
  g: { bars: [25, 28], name: 'Finale', energy: 0.8 },
};

/** Section energy at time `t` (seconds) — the part it falls in. */
export const no4Energy = (t, bpm = NO4_DEFAULT_BPM) => {
  for (const id of Object.keys(NO4_PARTS)) {
    const range = resolvePart(NO4_PARTS, id, { bpm });
    if (range && t >= range.start && t < range.end) return NO4_PARTS[id].energy;
  }
  return 0.8;
};

/** Auto look: phrase 0 is the seed itself, later phrases step deterministically. */
export const no4PhraseSeed = (seed, phrase) =>
  phrase <= 0 ? String(seed) : String((seedToInt(seed) + phrase * 7919) % 100000);

// A salted stream per param group (seeded-looks rule: new groups never shift old ones).
const stream = (seed, salt) => {
  const random = mulberry32(seedToInt(seed) ^ salt);
  for (let i = 0; i < 4; i++) random();
  return {
    random,
    pick: (arr) => arr[Math.floor(random() * arr.length)],
    chance: (p) => random() < p,
  };
};

const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'pink'];

// HSL (degrees, 0..1, 0..1) → sRGB 0..1 (the shader works in sRGB, Mondrian is flat paint).
const hsl = (h, s, l) => {
  const hh = (((h % 360) + 360) % 360) / 360;
  const f = (n) => {
    const k = (n + hh * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((v) => +v.toFixed(4));
};

// Hue offsets of the three accents. 'primary' is Mondrian's own red / yellow / blue.
const HARMONIES = {
  primary: [0, 48, 216],
  triad: [0, 120, 240],
  split: [0, 150, 210],
  analog: [0, 35, 180],
};
// Per-accent lightness, after Mondrian's paint (red 0.45, yellow 0.5, blue 0.4).
const ACCENT_L = [0.45, 0.5, 0.4];

// Light modes: paper + ink (lines) + the dark cell colour, and line glow.
const LIGHTS = {
  paper: () => ({ paper: hsl(45, 0.35, 0.94), ink: hsl(0, 0, 0.04), dark: hsl(0, 0, 0.06), glow: 0, accent: [0.95, 0] }),
  tint: (h) => ({ paper: hsl(h + 48, 0.7, 0.87), ink: hsl(h + 216, 0.55, 0.1), dark: hsl(h + 216, 0.55, 0.12), glow: 0, accent: [0.95, 0] }),
  ink: (h) => ({ paper: hsl(0, 0, 0.04), ink: hsl(45, 0.35, 0.94), dark: hsl(h + 216, 0.6, 0.16), glow: 0.25, accent: [1, 0.05] }),
  neon: (h) => ({ paper: hsl(h + 230, 0.5, 0.035), ink: hsl(h + 180, 0.35, 0.9), dark: hsl(h + 260, 0.7, 0.14), glow: 0.9, accent: [1, 0.08] }),
};

// Rectangles only: every fold keeps lines straight and axis-aligned.
// 6 / 8 tile the frame 2×2 / 3×3 with mirrored copies.
const FOLDS = { 0: 'none', 2: 'mirror', 4: 'quad', 6: 'tile2', 8: 'tile3' };

/**
 * @param {string|number} seed
 * @param {{ bpm?: number, beats?: number, speed?: number }} [opts]
 */
export const createNo4Look = (seed, { bpm = NO4_DEFAULT_BPM, beats = 16, speed = 1 } = {}) => {
  // Structure stream.
  const s = stream(seed, 0x4d6f6e64);
  const density = s.pick(['sparse', 'classic', 'classic', 'busy']);
  const depth = { sparse: [2, 4, 0.45], classic: [2, 5, 0.6], busy: [3, 6, 0.7] }[density];
  const quant = s.pick([0, 8, 12, 16]);
  const line = s.pick([0.012, 0.02, 0.03]);
  const fill = s.pick([0.3, 0.5, 0.75]);
  const fold = s.pick([0, 0, 2, 4, 4, 6, 8]);
  const portal = s.chance(0.5);
  const zoom = portal ? s.pick([0.5, 1]) : 0;
  const windowScale = s.pick([2, 2.5, 3]);
  const offCentre = portal && s.chance(0.4);
  const centreAngle = s.random() * Math.PI * 2;
  let warp = s.pick([0, 0, 0.5, 1]);
  const warpFreq = s.pick([2, 3, 5]);
  s.random(); // was the kaleido spin direction (kept so later picks don't shift)
  s.random(); // was the 45° lozenge (dropped: rectangles stay axis-aligned)
  const cycleBeats = s.pick([1, 2, 4, 0]);
  const hueSpin = s.pick([1, 1, 2, 3]);
  let rings = s.pick([0, 0.3, 0.6, 0.6]);
  const step = s.pick([1, 2]);
  const topBeats = s.pick([4, 8]);
  const build = s.chance(0.5) ? 1 : 0;
  const pump = s.pick([0.4, 1]);
  let aberr = s.pick([0, 0.004, 0.008, 0.008]);
  const shade = s.pick([0, 0.12]);

  // Colour stream.
  const c = stream(seed, 0x436f6c72);
  const classic = c.chance(0.4);
  const harmony = classic ? 'primary' : c.pick(Object.keys(HARMONIES));
  const hue = classic ? 0 : c.pick([...Array(12).keys()]) * 30;
  const light = c.pick(['neon', 'neon', 'ink', 'ink', 'tint', 'paper']);

  // Psychedelic stream: each cell's accent hue is shifted by up to
  // ±uSpread of a turn, so the grid shows many colours, not just three.
  const ps = stream(seed, 0x50737963);
  const spread = ps.pick([0.08, 0.16, 0.3]);

  // Density budget: stacking busy picks turns the frame to mush.
  let depthMax = depth[1];
  const tiled = fold >= 6;
  const score = (depthMax >= 6) + tiled + portal + (warp >= 1) + (rings >= 0.5) + (aberr > 0);
  if (score >= 3) {
    depthMax = Math.min(depthMax, 5);
    rings = Math.min(rings, 0.3);
  }
  if (score >= 4) {
    warp = Math.min(warp, 0.5);
    aberr = 0;
  }
  // Mirrored tiles repeat the centre; an off-centre portal breaks the symmetry.
  const centre = offCentre && !tiled ? 0.22 : 0;

  const lit = LIGHTS[light](hue);
  const [sat, lift] = lit.accent;
  const accents = HARMONIES[harmony].map((off, i) => hsl(hue + off, sat, ACCENT_L[i] + lift));

  const framing = tiled ? 'tiled' : centre ? 'off-centre' : 'square';
  const palette = classic ? (light === 'paper' ? 'mondrian' : `mondrian ${light}`) : `${HUE_NAMES[hue / 30]} ${harmony}`;

  return {
    seed: String(seed),
    bpm,
    beats,
    loopSec: (beats * 60) / bpm,
    layout: portal ? 'portal' : 'flat',
    fold: FOLDS[fold],
    density,
    light,
    framing,
    palette,
    palettes: [{ name: palette, hue }],
    uniforms: {
      uBeats: beats,
      uSeedSalt: (seedToInt(seed) % 997) + 0.5,
      // Subdivision: min/max depth of the split tree, and how often a cell
      // past the min keeps splitting.
      uDepthMin: depth[0],
      uDepthMax: depthMax,
      uDensity: depth[2],
      uQuant: quant, // 0 free, else lines snap to an N×N grid (the 2021 No3 used 16)
      uLine: line, // line weight, frame-height units (height = 2)
      uFill: fill, // share of cells painted (the rest paper / dark)
      uDark: 0.08,
      uFold: fold,
      uSpread: spread, // per-cell hue shift, ± turns
      // Portal: the composition has a window holding the next composition,
      // zooming in uZoom × speed windows per bar (0 = flat).
      uZoom: zoom * speed,
      uWindow: windowScale,
      uCenterX: +(centre * Math.cos(centreAngle)).toFixed(4),
      uCenterY: +(centre * Math.sin(centreAngle)).toFixed(4),
      uWarp: warp, // per-axis stretch (lines stay straight)
      uWarpFreq: warpFreq,
      uWarpCycles: Math.max(1, Math.round(2 * speed)), // drift cycles per loop
      uCycleBeats: cycleBeats, // primaries rotate cell to cell every N beats (0 = off)
      uHueSpin: hueSpin, // whole hue turns per loop
      uRings: rings, // share of painted cells carrying op-art rings
      uStep: step, // beats between line moves (inner levels)
      uTopBeats: topBeats, // beats between top-level moves / re-rolls
      uBuild: build, // 1: one more level of subdivision per beat, reset on the bar
      uSnap: 0.3, // line move length, beats
      uPump: pump, // line weight + frame punch on the beat
      uAberr: aberr,
      uGlow: lit.glow,
      uShade: shade, // darken deeper portal levels
      uAudio: 0.5, // generic amplitude → line glow / warp (ledger §12: keep FFT small)
      uPaper: lit.paper,
      uInk: lit.ink,
      uDarkCol: lit.dark,
      uColA: accents[0],
      uColB: accents[1],
      uColC: accents[2],
    },
  };
};

/** One line for the info overlay / console. */
export const describeNo4 = (look) =>
  `${look.layout} · ${look.fold} · ${look.density} · ${look.light} · ${look.framing} · ${look.palette}`;

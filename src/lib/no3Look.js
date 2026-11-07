/**
 * no3Look — seed → look for #RectanglesNo3 (Piet Mondrian grid).
 *
 * Pure ES module, no p5 and no browser globals: the lab's `pnpm seed:table`
 * imports it from Node to shortlist seeds that differ in structure.
 *
 *   createNo3Look(seed)            → the look: palette + grid + composition rules
 *   gridFor(look, width, height)   → cell layout for a canvas size
 *   createCompositions(look, cols, rows, count)
 *                                  → `count` compositions (all from the seed)
 *
 * Every choice is an either/or pick that reads in a 5s reel (ledger §13):
 * grid density, block span, how much colour, line weight, a 45° lozenge
 * (Mondrian's diamond canvases), the order pieces are built in and how a new composition enters.
 * The palette stays inside Mondrian's own logic: off-white ground, black (or
 * yellow / white / grey) lines, red, blue and yellow planes.
 */

import { createRng } from './reelParams.js';

/** The track: 112 BPM, 4/4, 28 bars (2.143s a bar). */
export const NO3_BPM = 112;

/**
 * Reel parts on bar lines (1-based, inclusive): the track's seven 4-bar
 * phrases, back to back, so playing on flows from one into the next with no
 * jump in the music. Each is 8.57s and a loop on its own. Use with
 * `applyPart(p, NO3_PARTS, part, { bpm: NO3_BPM })`.
 */
export const NO3_PARTS = {
  a: { bars: [1, 4], name: 'Riffs' }, // guitar + clavinet: a new composition on every riff
  b: { bars: [5, 8], name: 'Drums' }, // drums in, the clavinet builds a composition piece by piece
  c: { bars: [9, 12], name: 'Build' }, // second build, the guitar starts re-rolling the colours
  d: { bars: [13, 16], name: 'Climb' }, // third build, Synth 2 busier
  e: { bars: [17, 20], name: 'Storm' }, // last build, the wheeler's pickup
  f: { bars: [21, 24], name: 'Wheeler' }, // filter wheeler: a new composition every note, drums under it
  g: { bars: [25, 28], name: 'Finale' }, // drums out, the wheeler and clavinet race to the end
};

/**
 * Mondrian palettes. `black` is the fifth plane colour (Mondrian's black
 * blocks); `primaries` are the three the guitar re-rolls between.
 */
export const NO3_PALETTES = {
  // Composition with Red, Blue and Yellow (1930).
  classic: { ground: '#f5f3ee', line: '#121212', black: '#121212', primaries: ['#dd0100', '#225095', '#fac901'] },
  // Broadway Boogie Woogie (1943): yellow lines, red / blue / grey blocks, yellow bars.
  boogie: { ground: '#efede6', line: '#f2c400', black: '#f2c400', primaries: ['#d6281b', '#2a4fa0', '#bdbab2'] },
  // Inverted: white lines and planes on black.
  noir: { ground: '#0e0e0e', line: '#f2efe8', black: '#f2efe8', primaries: ['#ff2a1a', '#2f6bff', '#ffd21f'] },
  // Early 1920s: faded primaries and grey planes.
  muted: { ground: '#ebe7dc', line: '#2b2b2b', black: '#8f8f8a', primaries: ['#c1432e', '#4a6a9a', '#e2b93b'] },
};

const LINES = { fine: 0.07, bold: 0.11, heavy: 0.16 }; // share of a cell
const FILLS = { sparse: 0.72, balanced: 0.55, dense: 0.36 }; // share of white planes
const BLACK_SHARE = 0.16; // of the coloured planes

/**
 * Seed → look. Same seed, same look. Options are accepted for the seed-table
 * contract (`{ bpm }`) and only recorded.
 * @param {string|number} seed
 * @param {{ bpm?: number }} [opts]
 */
export const createNo3Look = (seed, { bpm = NO3_BPM } = {}) => {
  const rng = createRng(seed);
  // Draw order is part of every seed's look: append new picks, never insert.
  const palette = rng.pick(['classic', 'classic', 'boogie', 'noir', 'muted']);
  const cols = rng.pick([6, 9, 12, 16]);
  const span = rng.pick([2, 3, 4]);
  const fill = rng.pick(['sparse', 'balanced', 'dense']);
  const line = rng.pick(['fine', 'bold', 'heavy']);
  const lozenge = rng.chance(0.25);
  const build = rng.pick(['scatter', 'sweep', 'blocks']);
  const enter = rng.pick(['cascade', 'wipe', 'cut']);
  return {
    seed: String(seed),
    bpm,
    palette,
    cols,
    span: Math.min(span, Math.max(2, Math.floor(cols / 3))),
    fill,
    line,
    lozenge,
    build,
    enter,
    colours: NO3_PALETTES[palette],
    uniforms: { uLine: LINES[line], uWhite: FILLS[fill] },
  };
};

/**
 * Cell layout for a canvas. Upright: `cols` across, square-ish cells, rows
 * from the aspect ratio. Lozenge: a square cols × cols grid,
 * rotated 45° and big enough to cover the whole canvas.
 */
export const gridFor = (look, width, height) => {
  if (look.lozenge) {
    const side = (width + height) / Math.SQRT2;
    const cell = side / look.cols;
    return { cols: look.cols, rows: look.cols, cellW: cell, cellH: cell, gridW: side, gridH: side, tilt: true };
  }
  const cellW = width / look.cols;
  const rows = Math.max(1, Math.round(height / cellW));
  return { cols: look.cols, rows, cellW, cellH: height / rows, gridW: width, gridH: height, tilt: false };
};

// 0 white plane, 1 black plane, 2–4 the three primaries (before re-rolls).
const pickColour = (rng, area, white) => {
  const colourChance = (1 - white) * (area <= 1 ? 1.25 : area >= 6 ? 0.5 : 1);
  if (!rng.chance(colourChance)) return 0;
  if (rng.chance(BLACK_SHARE)) return 1;
  return 2 + Math.floor(rng.random() * 3);
};

/**
 * One composition: random empty cells grow into 1…span-cell rectangles that
 * never overlap, until the grid is full (the 2021 algorithm, minus overlaps).
 * Pieces come back in build order.
 */
export const createComposition = (rng, look, cols, rows) => {
  const filled = new Uint8Array(cols * rows);
  const white = FILLS[look.fill] ?? FILLS.balanced;
  const pieces = [];
  const cells = rng.shuffle(Array.from({ length: cols * rows }, (_, i) => i));
  const rowEmpty = (y, x, w) => {
    for (let i = x; i < x + w; i++) if (filled[y * cols + i]) return false;
    return true;
  };
  for (const idx of cells) {
    if (filled[idx]) continue;
    const x = idx % cols;
    const y = Math.floor(idx / cols);
    const wantW = Math.min(rng.int(1, look.span), cols - x);
    const wantH = Math.min(rng.int(1, look.span), rows - y);
    let w = 1;
    while (w < wantW && !filled[y * cols + x + w]) w++;
    let h = 1;
    while (h < wantH && rowEmpty(y + h, x, w)) h++;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) filled[j * cols + i] = 1;
    pieces.push({ x, y, w, h, c: pickColour(rng, w * h, white) });
  }
  if (look.build === 'sweep') pieces.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
  else if (look.build === 'blocks') pieces.sort((a, b) => b.w * b.h - a.w * a.h);
  return pieces;
};

/** `count` compositions for a cols × rows grid, all from the look's seed. */
export const createCompositions = (look, cols, rows, count = 64) => {
  const rng = createRng(`${look.seed}:comps:${cols}x${rows}`);
  return Array.from({ length: count }, () => createComposition(rng, look, cols, rows));
};

/** The six orders of the three primaries; the guitar re-rolls between them. */
export const PRIMARY_PERMS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

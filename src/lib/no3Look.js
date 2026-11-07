/**
 * no3Look — seed → look for #RectanglesNo3 (Piet Mondrian grid).
 *
 * Pure ES module, no p5 and no browser globals: the lab's `pnpm seed:table`
 * imports it from Node to shortlist seeds that differ in structure.
 *
 *   createNo3Look(seed) → { palette, rerolls, builds, … }
 *   createComposition(seed, key, grid, order) → one composition (same args, same one)
 *
 * What a seed decides (each an either/or that reads in a 5s reel):
 *   palette   part A's palette (Mondrian's own, twice as likely as any other)
 *   rerolls   the palettes the guitar steps through from bar 9 (no repeats
 *             until the bank runs out)
 *   builds    the four clavinet builds (parts B–E): each its own grid,
 *             climbing in density as the song builds, and its own build order
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

const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/**
 * The palette bank. Five slots each, as the sketch uses them: 0 dark plane,
 * 1 light plane, 2–4 the three colours (the background is built from their
 * complements). Lines are always black.
 */
export const NO3_PALETTES = Object.fromEntries(
  Object.entries({
    // Composition with Red, Blue and Yellow (1930): the only red / blue / yellow one.
    // The rest are each their own hue family, all strong and saturated.
    mondrian: ['#000000', '#ffffff', '#dd0100', '#225095', '#fac901'],
    // Sunset: blaze orange, hot pink, amber.
    sunset: ['#000000', '#ffffff', '#ff5400', '#ff0054', '#ffbd00'],
    // Ocean: cyan, electric blue, aqua.
    ocean: ['#000000', '#ffffff', '#00b4d8', '#0047ff', '#00f5d4'],
    // Vapor: magenta, cyan, violet.
    vapor: ['#000000', '#ffffff', '#ff2ec4', '#00e5ff', '#8a2be2'],
    // Citrus: orange, lemon, lime.
    citrus: ['#000000', '#ffffff', '#ff7b00', '#ffe600', '#70e000'],
    // Jungle: emerald, teal, chartreuse.
    jungle: ['#000000', '#ffffff', '#00c853', '#00bfa5', '#aeea00'],
    // Berry: purple, raspberry, hot pink.
    berry: ['#000000', '#ffffff', '#9d00ff', '#ff006e', '#ff2d95'],
  }).map(([name, slots]) => [name, slots.map(hex)]),
);

const PALETTE_NAMES = Object.keys(NO3_PALETTES);

/**
 * How a build lays its pieces down: `random` (the 2021 order), `centre`
 * (grows out from the middle, loosely: jittered so it never reads as a
 * sweep), `blocks` (biggest pieces first, small ones filling in).
 */
export const NO3_BUILD_ORDERS = ['random', 'centre', 'blocks'];
const CENTRE_JITTER = 0.45; // share of the board's half-diagonal

/**
 * Magic rectangles ("Boogie Woogie windows", drawn by the sketch): the share
 * of compositions that get one, and the piece count above which they get two.
 * Only pieces at least 2×2 cells qualify, the bigger the likelier.
 */
export const NO3_MAGIC_CHANCE = 0.6;
const MAGIC_TWO_ABOVE = 60;

/**
 * Seed → look. Same seed, same look. Options are accepted for the seed-table
 * contract (`{ bpm }`) and only recorded.
 * @param {string|number} seed
 * @param {{ bpm?: number }} [opts]
 */
export const createNo3Look = (seed, { bpm = NO3_BPM } = {}) => {
  const rng = createRng(seed);
  // Draw order is part of every seed's look: append new picks, never insert.
  const palette = rng.pick(['mondrian', ...PALETTE_NAMES]);
  const rerolls = rng.shuffle(PALETTE_NAMES.filter((n) => n !== palette));
  // Density climbs through the builds: a start and a step per seed.
  const start = rng.pick([6, 8]);
  const step = rng.pick([3, 4]);
  const builds = [0, 1, 2, 3].map((i) => ({ grid: start + step * i, order: rng.pick(NO3_BUILD_ORDERS) }));
  return { seed: String(seed), bpm, palette, rerolls, builds };
};

/** One line for the console / seed table. */
export const describeNo3Look = (look) =>
  `${look.palette} · builds ${look.builds.map((b) => `${b.grid}×${b.grid} ${b.order}`).join(', ')}`;

/**
 * Mark this composition's magic pieces (`piece.magic = true`). Its own random
 * stream, so adding it changed no composition.
 */
const markMagic = (seed, key, pieces) => {
  const rng = createRng(`${seed}:magic:${key}`);
  if (!rng.chance(NO3_MAGIC_CHANCE)) return;
  const area = (pc) => pc.widthMultiplier * pc.heightMultiplier;
  // Biggest half of the 2×2-and-up pieces.
  const pool = pieces
    .filter((pc) => pc.widthMultiplier >= 2 && pc.heightMultiplier >= 2)
    .sort((a, b) => area(b) - area(a));
  const candidates = rng.shuffle(pool.slice(0, Math.max(1, Math.ceil(pool.length / 2))));
  const count = pieces.length > MAGIC_TWO_ABOVE ? 2 : 1;
  candidates.slice(0, count).forEach((pc) => {
    pc.magic = true;
  });
};

/**
 * One composition on a grid × grid board: the 2021 algorithm. Random empty
 * cells become 1–4 × 1–4 cell rectangles (clamped to the board), each a random
 * palette slot, until every cell is covered. Pieces come back in `order`.
 * Same (seed, key, grid, order) → same composition.
 * @returns {{ x: number, y: number, widthMultiplier: number, heightMultiplier: number, colourIndex: number }[]}
 */
export const createComposition = (seed, key, grid, order = 'random') => {
  const rng = createRng(`${seed}:comp:${key}`);
  const filled = new Uint8Array(grid * grid);
  const cells = rng.shuffle(Array.from({ length: grid * grid }, (_, i) => i));
  const pieces = [];
  for (const idx of cells) {
    if (filled[idx]) continue;
    // 1-based like the 2021 code: cell (x, y) spans (x - 1)…x.
    const x = (idx % grid) + 1;
    const y = Math.floor(idx / grid) + 1;
    let widthMultiplier = x < grid ? rng.int(1, 4) : 1;
    let heightMultiplier = y < grid ? rng.int(1, 4) : 1;
    widthMultiplier = x + widthMultiplier > grid ? grid + 1 - x : widthMultiplier;
    heightMultiplier = y + heightMultiplier > grid ? grid + 1 - y : heightMultiplier;
    pieces.push({ x, y, widthMultiplier, heightMultiplier, colourIndex: rng.int(0, 4) });
    for (let i = x; i < x + widthMultiplier; i++) {
      for (let j = y; j < y + heightMultiplier; j++) filled[(j - 1) * grid + (i - 1)] = 1;
    }
  }
  if (order === 'centre') {
    // Distance of each piece's centre from the board's, plus a random nudge.
    const mid = grid / 2;
    const reach = Math.hypot(mid, mid);
    const rank = new Map(
      pieces.map((pc) => {
        const d = Math.hypot(pc.x - 1 + pc.widthMultiplier / 2 - mid, pc.y - 1 + pc.heightMultiplier / 2 - mid);
        return [pc, d + rng.random() * reach * CENTRE_JITTER];
      }),
    );
    pieces.sort((a, b) => rank.get(a) - rank.get(b));
  } else if (order === 'blocks') {
    pieces.sort((a, b) => b.widthMultiplier * b.heightMultiplier - a.widthMultiplier * a.heightMultiplier);
  }
  markMagic(seed, key, pieces);
  return pieces;
};

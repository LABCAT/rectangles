/**
 * no1Look — seed → look for #RectanglesNo1. Pure ES module (no p5, no DOM),
 * so the lab's `pnpm seed:table` can run it from plain Node.
 *
 * The piece is finished; the seed only picks a variation inside its look:
 *   - the tetradic hue of the four rectangles (baseHue, +90 / +180 / +270);
 *     hues 90° apart give the same four colours on other corners, so seed:table
 *     compares `palette` (one of three tetrads, 30° steps) and `turn` (0–3
 *     quarter turns: which of them sits top-left and lights first),
 *   - the background gradient on each track-1 chord (`bgSeed(cue)`),
 *   - how fast each rectangle swells on a long bass note (`growRate(cue, corner, all)`).
 * Every per-cue value is keyed by the cue number, not by draw order, so a
 * section cut (capture fast-forward) lands on the same frames as a full play.
 */

import { createRng, seedToInt } from './reelParams.js';

/** Track tempo from the MIDI header (156 BPM, 4/4). */
export const NO1_BPM = 156;

/**
 * Reel parts, bar ranges (1-based, inclusive) on the track's 4-bar phrases
 * (1 bar = 1.538s). The drums play bars 1–24 and drop out at bar 25; each
 * phrase ends on a long bass note (bars 4, 8, …, 32) that swells the rectangles.
 */
export const NO1_PARTS = {
  a: { bars: [1, 8] }, // 0.00–12.31s  opening: the full groove from the downbeat, two swells
  b: { bars: [13, 16] }, // 18.46–24.62s  one mid-groove phrase into a swell
  c: { bars: [21, 28] }, // 30.77–43.08s  the drums drop out at bar 25, bass carries on
  d: { bars: [29, 32] }, // 43.08–49.23s  the last phrase and the final, longest swell
};
const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'pink'];

/**
 * @param {string|number} seed
 * @param {object} [_opts] unused; accepted so seed:table's `options` can be passed
 * @returns {{ seed: string, baseHue: number, hues: number[], palette: string, turn: number,
 *   palettes: { name: string, hue: number }[],
 *   bgSeed: (cue: number) => number, growRate: (cue: number, corner: number, all: boolean) => number }}
 */
export const createNo1Look = (seed, _opts = {}) => {
  const rng = createRng(seed);
  const baseHue = rng.range(0, 360);
  const hues = [0, 90, 180, 270].map((d) => (baseHue + d) % 360);
  // Top-left hue to the nearest named 30° step: tetrad = which four colours, turn = which corner leads.
  const step = Math.round(baseHue / 30) % 12;
  const tetrad = step % 3;
  const turn = Math.floor(step / 3);
  const palette = [0, 3, 6, 9].map((i) => HUE_NAMES[tetrad + i]).join('/');
  return {
    seed: String(seed),
    baseHue,
    hues,
    palette,
    turn,
    palettes: [{ name: palette, hue: baseHue }],
    // p.randomSeed() value for the gradient drawn on track-1 cue `cue` (0 = the opening one).
    bgSeed: (cue) => seedToInt(`${seed}:bg:${cue}`),
    // Swell rate of `corner` (0–3) on a long bass note: all four corners at once (0.5–1.75) or one (0.62–1.45).
    growRate: (cue, corner, all) => {
      const r = createRng(`${seed}:grow:${cue}:${corner}`);
      return all ? r.range(0.5, 1.75) : r.range(0.62, 1.45);
    },
  };
};

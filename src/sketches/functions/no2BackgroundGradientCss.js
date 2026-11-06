/**
 * RectanglesNo2 backgrounds — a few restrained recipes (still not No1's linear style).
 *
 * Pure and seeded: the look fixes the recipe and hue family; each drum hit
 * (`index`) draws its own jitter from a sub-stream, so the n-th background of
 * a seed is always the same and capture is reproducible.
 */

import { eventRng, hsbToRgb, rgbToHex } from '../../lib/no2Look.js';

const BG_SALT = 12;

const chromaHex = (h, s, b) => rgbToHex(hsbToRgb(h, s, b));

const softConic = (r, h0) => {
  const c0 = chromaHex(h0, r.range(48, 72), r.range(42, 60));
  const c1 = chromaHex(h0 + r.range(35, 65), r.range(50, 75), r.range(40, 58));
  const c2 = chromaHex(h0 + r.range(85, 125), r.range(45, 72), r.range(38, 56));
  const c3 = chromaHex(h0 + r.range(150, 200), r.range(48, 70), r.range(40, 58));
  const cx = r.range(40, 60);
  const cy = r.range(40, 60);
  const from = r.range(0, 360);
  return `conic-gradient(from ${from}deg at ${cx}% ${cy}%, ${c0}, ${c1}, ${c2}, ${c3}, ${c0})`;
};

const filmRadial = (r, h) => {
  const edge = chromaHex(h + r.range(-12, 12), r.range(38, 58), r.range(30, 46));
  const mid = chromaHex(h + r.range(28, 48), r.range(45, 65), r.range(42, 56));
  const core = chromaHex(h + r.range(50, 85), r.range(42, 62), r.range(48, 64));
  const lin = `linear-gradient(${r.range(0, 360)}deg, ${edge} 0%, ${mid} 50%, ${core} 100%)`;
  const rad = `radial-gradient(ellipse 78% 68% at ${r.range(44, 56)}% ${r.range(44, 56)}%, transparent 50%, rgba(0,0,0,0.18) 100%)`;
  return `${rad}, ${lin}`;
};

const angledDuo = (r, h) => {
  const a = chromaHex(h, r.range(40, 62), r.range(38, 52));
  const b = chromaHex(h + r.range(55, 95), r.range(45, 68), r.range(44, 58));
  return `linear-gradient(${r.range(0, 360)}deg, ${a} 0%, ${b} 100%)`;
};

const BUILDERS = { conic: softConic, film: filmRadial, duo: angledDuo };

/**
 * @param {{ seed: string, bg: string, hue: number }} look
 * @param {number} index  which background change this is (0-based)
 * @returns {{ background: string, backgroundBlendMode: string }}
 */
export function getNo2BackgroundGradientCss(look, index = 0) {
  const r = eventRng(look.seed, BG_SALT, index);
  // Stay near the look's hue so the reel keeps one colour story.
  const h = look.hue + r.range(-25, 25);
  const build = BUILDERS[look.bg] ?? softConic;
  return {
    background: build(r, h),
    backgroundBlendMode: 'normal',
  };
}

/**
 * RectanglesNo2 backgrounds — a few restrained recipes (still not No1's linear style).
 *
 * Pure and seeded: the look fixes the recipe and hue family; each drum hit
 * (`index`) draws its own jitter from a sub-stream, so the n-th background of
 * a seed is always the same and capture is reproducible.
 *
 * A background is a list of layer specs (bottom → top). `paintNo2Background`
 * draws them with Canvas2D (the sketch renders them into the WebGL canvas, so
 * capture needs no DOM compositing); `getNo2BackgroundGradientCss` gives the
 * same layers as CSS.
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
  return [{ type: 'conic', from, cx, cy, stops: [c0, c1, c2, c3, c0].map((c, i) => [c, i / 4]) }];
};

const filmRadial = (r, h) => {
  const edge = chromaHex(h + r.range(-12, 12), r.range(38, 58), r.range(30, 46));
  const mid = chromaHex(h + r.range(28, 48), r.range(45, 65), r.range(42, 56));
  const core = chromaHex(h + r.range(50, 85), r.range(42, 62), r.range(48, 64));
  const lin = { type: 'linear', angle: r.range(0, 360), stops: [[edge, 0], [mid, 0.5], [core, 1]] };
  const vignette = {
    type: 'radial',
    rx: 78,
    ry: 68,
    cx: r.range(44, 56),
    cy: r.range(44, 56),
    stops: [['rgba(0,0,0,0)', 0.5], ['rgba(0,0,0,0.18)', 1]],
  };
  return [lin, vignette];
};

const angledDuo = (r, h) => {
  const a = chromaHex(h, r.range(40, 62), r.range(38, 52));
  const b = chromaHex(h + r.range(55, 95), r.range(45, 68), r.range(44, 58));
  return [{ type: 'linear', angle: r.range(0, 360), stops: [[a, 0], [b, 1]] }];
};

const BUILDERS = { conic: softConic, film: filmRadial, duo: angledDuo };

/**
 * @param {{ seed: string, bg: string, hue: number }} look
 * @param {number} index  which background change this is (0-based)
 * @returns {Array<object>} layer specs, bottom first
 */
export function getNo2BackgroundLayers(look, index = 0) {
  const r = eventRng(look.seed, BG_SALT, index);
  // Stay near the look's hue so the reel keeps one colour story.
  const h = look.hue + r.range(-25, 25);
  return (BUILDERS[look.bg] ?? softConic)(r, h);
}

const pct = (u) => `${Math.round(u * 1000) / 10}%`;

const layerCss = (L) => {
  const stops = L.stops.map(([c, at]) => `${c} ${pct(at)}`).join(', ');
  if (L.type === 'conic') return `conic-gradient(from ${L.from}deg at ${L.cx}% ${L.cy}%, ${stops})`;
  if (L.type === 'radial') return `radial-gradient(ellipse ${L.rx}% ${L.ry}% at ${L.cx}% ${L.cy}%, ${stops})`;
  return `linear-gradient(${L.angle}deg, ${stops})`;
};

/** The same background as CSS (`background` lists its top layer first). */
export function getNo2BackgroundGradientCss(look, index = 0) {
  const layers = getNo2BackgroundLayers(look, index);
  return {
    background: [...layers].reverse().map(layerCss).join(', '),
    backgroundBlendMode: 'normal',
  };
}

const DEG = Math.PI / 180;

const paintLayer = (ctx, W, H, L) => {
  let grad;
  if (L.type === 'conic') {
    // CSS: 0deg points up, clockwise. Canvas: 0 points right, clockwise.
    grad = ctx.createConicGradient((L.from - 90) * DEG, (L.cx / 100) * W, (L.cy / 100) * H);
  } else if (L.type === 'radial') {
    // Ellipse with radii as % of the box: draw a unit circle in a scaled space.
    const cx = (L.cx / 100) * W;
    const cy = (L.cy / 100) * H;
    const rx = (L.rx / 100) * W;
    const ry = (L.ry / 100) * H;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [c, at] of L.stops) grad.addColorStop(at, c);
    ctx.fillStyle = grad;
    ctx.fillRect(-cx / rx, -cy / ry, W / rx, H / ry);
    ctx.restore();
    return;
  } else {
    // CSS linear-gradient: 0deg = to top, clockwise; the line spans the box's
    // projection onto that direction.
    const a = L.angle * DEG;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
    grad = ctx.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half);
  }
  for (const [c, at] of L.stops) grad.addColorStop(at, c);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
};

/** Paint the n-th background of a look into a Canvas2D context (W × H px). */
export function paintNo2Background(ctx, W, H, look, index = 0) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (index >= 0) for (const L of getNo2BackgroundLayers(look, index)) paintLayer(ctx, W, H, L);
  ctx.restore();
}

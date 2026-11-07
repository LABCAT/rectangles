/**
 * Black veil in front of a CSS background, as RectanglesNo1 does it: stacked
 * rectangular black rings from the centre to the viewport edge, the outer
 * ones darker (a rectangular vignette). Drawn into the canvas.
 */

const RING_COUNT = 22;
const LAYER_FLOOR = 0.28; // centre ring's share of `opacity`
const LAYER_RANGE = 0.48; // added towards the edge

/** Axis-aligned frame between inner and outer half-extents from (cx, cy). */
const drawFilledRectRing = (p, cx, cy, iw, ih, ow, oh) => {
  if (ow <= iw || oh <= ih) return;
  const oL = cx - ow;
  const oT = cy - oh;
  const oR = cx + ow;
  const oB = cy + oh;
  const iL = cx - iw;
  const iT = cy - ih;
  const iR = cx + iw;
  const iB = cy + ih;
  if (iT > oT) p.rect(oL, oT, oR, iT);
  if (oB > iB) p.rect(oL, iB, oR, oB);
  if (iB > iT && iL > oL) p.rect(oL, iT, iL, iB);
  if (iB > iT && oR > iR) p.rect(iR, iT, oR, iB);
};

/**
 * @param {import('p5')} p
 * @param {number} opacity 0–1: the edge ring gets ~0.76× this, the centre ~0.28×
 */
export const drawBlackVeil = (p, opacity) => {
  if (opacity <= 0) return;
  const cx = p.width * 0.5;
  const cy = p.height * 0.5;
  const overlap = 0.05 / RING_COUNT;
  p.push();
  p.colorMode(p.RGB, 255);
  p.rectMode(p.CORNERS);
  p.noStroke();
  for (let i = 0; i < RING_COUNT; i++) {
    const t0 = i / RING_COUNT;
    const t1 = Math.min(1, (i + 1) / RING_COUNT + overlap);
    const layerT = i / (RING_COUNT - 1);
    const a = Math.min(1, opacity * (LAYER_FLOOR + LAYER_RANGE * layerT));
    p.fill(0, 0, 0, a * 255);
    drawFilledRectRing(p, cx, cy, t0 * cx, t0 * cy, t1 * cx, t1 * cy);
  }
  p.pop();
};

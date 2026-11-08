/**
 * Boogie Woogie window: a magic rectangle in #RectanglesNo3 that opens onto
 * Mondrian's Broadway Boogie Woogie (1943). Inside the rectangle: a light
 * ground, its own little grid of "streets" in the palette's fifth colour, and
 * traffic — small squares in the other colours — running along every street,
 * alternate streets the opposite way. `travel` (in hops) moves the traffic;
 * the sketch steps it on the drum hits, so the city pulses with the beat.
 *
 * Drawn into the canvas, clipped to the rectangle, from (salt, travel) alone,
 * so a seek or capture frame draws the same window.
 */

/** 0–1 hash of a few numbers. */
const hash01 = (a, b, c = 0) => {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

const GROUND_ALPHA = 235;
const LINE_SHARE = 0.075; // street width, share of the window's short side
const GAP_CHANCE = 0.3; // gaps in the traffic

/**
 * @param {import('p5')} p
 * @param {{ cx: number, cy: number, w: number, h: number,
 *   colours: { r: number, g: number, b: number }[], salt: number, travel: number }} o
 *   colours: the 5 palette slots (1 the ground, 4 the streets, 2 / 3 / 0 traffic)
 */
export const drawBoogieWindow = (p, { cx, cy, w, h, colours, salt, travel }) => {
  if (w < 8 || h < 8) return;
  const left = cx - w / 2;
  const top = cy - h / 2;
  const short = Math.min(w, h);
  const th = Math.max(3, short * LINE_SHARE);
  const spacing = Math.max(th * 4, short / 3.2);
  const hop = th * 2.2;
  const ground = colours[1];
  const street = colours[4];
  const traffic = [colours[2], colours[3], colours[0]];

  const ctx = p.drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, w, h);
  ctx.clip();
  p.push();
  p.rectMode(p.CORNER);
  p.noStroke();
  p.fill(ground.r, ground.g, ground.b, GROUND_ALPHA);
  p.rect(left, top, w, h);

  // Street positions: evenly spread, nudged a little per window.
  const streets = (span, count, axis) =>
    Array.from({ length: count }, (_, i) => {
      const nudge = (hash01(salt, i, axis) - 0.5) * spacing * 0.4;
      return ((i + 0.5) * span) / count + nudge - th / 2;
    });
  const cols = streets(w, Math.max(1, Math.round(w / spacing)), 1);
  const rows = streets(h, Math.max(1, Math.round(h / spacing)), 2);

  p.fill(street.r, street.g, street.b);
  for (const x of cols) p.rect(left + x, top, th, h);
  for (const y of rows) p.rect(left, top + y, w, th);

  // Traffic: one hop apart; each square keeps its colour as it moves, and
  // wraps around the street. Alternate streets run the other way.
  const runTraffic = (pos, length, horizontal, lane) => {
    const n = Math.ceil(length / hop) + 1;
    const dir = lane % 2 === 0 ? 1 : -1;
    const offset = (((travel * dir * hop) % (n * hop)) + n * hop) % (n * hop);
    for (let i = 0; i < n; i++) {
      if (hash01(salt + lane, i, 3) < GAP_CHANCE) continue;
      const c = traffic[Math.floor(hash01(salt, lane, i) * traffic.length)];
      const along = ((i * hop + offset) % (n * hop)) - hop;
      p.fill(c.r, c.g, c.b);
      if (horizontal) p.rect(left + along, top + pos, th, th);
      else p.rect(left + pos, top + along, th, th);
    }
  };
  cols.forEach((x, i) => runTraffic(x, h, false, i));
  rows.forEach((y, i) => runTraffic(y, w, true, cols.length + i));

  p.pop();
  ctx.restore();
};

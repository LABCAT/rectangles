/**
 * #RectanglesNo3 background: stacked CSS gradients (the series' full-screen
 * wash, as in Triangles / Donuts) built from the composition's own palette —
 * the COMPLEMENTS of the three Mondrian slots (red / blue / yellow, re-rolled
 * from bar 9), so the wash sits opposite the rectangles on the colour wheel.
 * A new wash per composition.
 *
 * Layers, top first:
 *   overlay    a linear, colour to colour, for crossing bands
 *   screen ×2  pools of colour fading to black (black = no change under screen)
 *   soft-light a light-to-dark halo: lifts the middle, sinks the corners
 *   normal     the base: all three colours across the frame, so it is never
 *              one flat colour
 */
import { createRng } from '../../lib/reelParams.js';

export const NO3_BG_BLEND = 'overlay, screen, screen, soft-light, normal';

/** Hue turned 180°, same saturation and lightness: each channel → max + min − it. */
const complement = ({ r, g, b }) => {
  const sum = Math.max(r, g, b) + Math.min(r, g, b);
  return { r: sum - r, g: sum - g, b: sum - b };
};

const rgb = (c, k = 1) =>
  `rgb(${Math.round(Math.min(255, c.r * k))}, ${Math.round(Math.min(255, c.g * k))}, ${Math.round(Math.min(255, c.b * k))})`;

/**
 * @param {{ r: number, g: number, b: number }[]} colours the 5 palette slots
 *   (0 black, 1 white, 2–4 the three colours)
 * @param {string|number} key same key + colours → same wash (seek / capture safe)
 */
export const no3BackgroundCss = (colours, key) => {
  const rng = createRng(`no3-bg:${key}`);
  const [a, b, c] = rng.shuffle([colours[2], colours[3], colours[4]].map(complement));
  const int = (min, max) => min + Math.floor(rng.random() * (max - min + 1));
  const angle = int(0, 359);
  const layers = [];

  // Overlay: crossing bands, colour to colour.
  layers.push(`linear-gradient(${(angle + int(60, 120)) % 360}deg, ${rgb(c)} ${int(0, 20)}%, ${rgb(a)} ${int(45, 60)}%, ${rgb(b)} 100%)`);

  // Screen: two pools of colour in opposite halves, fading out to black.
  const px = int(8, 42);
  const py = int(8, 92);
  layers.push(`radial-gradient(${int(45, 75)}% ${int(45, 75)}% at ${px}% ${py}%, ${rgb(b)} 0%, rgb(0, 0, 0) 100%)`);
  layers.push(`radial-gradient(${int(45, 75)}% ${int(45, 75)}% at ${100 - px + int(-8, 8)}% ${100 - py + int(-8, 8)}%, ${rgb(c)} 0%, rgb(0, 0, 0) 100%)`);

  // Soft-light halo: lifts the middle, only a touch darker at the corners.
  layers.push(`radial-gradient(ellipse at ${int(40, 60)}% ${int(40, 60)}%, rgb(255, 255, 255) 0%, rgb(160, 160, 160) 50%, rgb(100, 100, 100) 100%)`);

  // Base: all three colours across the frame.
  layers.push(`linear-gradient(${angle}deg, ${rgb(a)} 0%, ${rgb(b)} ${int(40, 60)}%, ${rgb(c)} 100%)`);

  return layers.join(', ');
};

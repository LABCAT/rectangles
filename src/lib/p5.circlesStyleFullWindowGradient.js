/**
 * One CSS gradient covering the full viewport (single background image, no stacked layers).
 */

const chromaRgb = (p, h, sat, bri) => {
  p.push();
  p.colorMode(p.HSB, 360, 100, 100);
  const hh = ((h % 360) + 360) % 360;
  const c = p.color(hh, p.constrain(sat, 0, 100), p.constrain(bri, 0, 100));
  const out = { r: Math.round(p.red(c)), g: Math.round(p.green(c)), b: Math.round(p.blue(c)) };
  p.pop();
  return out;
};

const biasedHue = (p, variant, salt, driftDeg, hueSkew) => {
  const roll = p.random();
  let h;
  if (roll < 0.2) h = p.random(4, 46);
  else if (roll < 0.36) h = p.random(46, 88);
  else if (roll < 0.52) h = p.random(275, 348);
  else if (roll < 0.66) h = p.random(248, 275);
  else if (roll < 0.78) h = p.random(88, 148);
  else if (roll < 0.88) h = p.random(0, 18);
  else if (roll < 0.94) h = p.random(148, 172);
  else h = p.random(188, 218);
  h = (h + hueSkew + variant * driftDeg + salt * 17 + p.random(-22, 22) + 360) % 360;
  if (p.random() < 0.24) h = (h + 180) % 360;
  return h;
};

const rgbToHex = (r, g, b) =>
  `#${[r, g, b]
    .map((x) => {
      const hex = x.toString(16);
      return hex.length === 1 ? `0${hex}` : hex;
    })
    .join('')}`;

/**
 * @returns {{ background: string, backgroundBlendMode: string }}
 */
export function getFullWindowGradientCss(p) {
  const drift = 47;
  const hueSkew = p.random(-40, 40);
  const pick = (salt, dark) => {
    if (dark && p.random() < 0.12) {
      return chromaRgb(p, biasedHue(p, 0, salt, drift, hueSkew), p.random(12, 38), p.random(28, 52));
    }
    if (dark) {
      return chromaRgb(p, biasedHue(p, 0, salt, drift, hueSkew), p.random(42, 88), p.random(28, 52));
    }
    const r = p.random();
    if (r < 0.35) {
      return chromaRgb(p, biasedHue(p, 0, salt, drift, hueSkew), p.random(48, 92), p.random(38, 62));
    }
    if (r < 0.75) {
      return chromaRgb(p, biasedHue(p, 0, salt, drift, hueSkew), p.random(55, 95), p.random(48, 82));
    }
    return chromaRgb(p, biasedHue(p, 0, salt, drift, hueSkew), p.random(70, 100), p.random(72, 100));
  };

  const c1 = pick(1, true);
  const c2 = pick(2, false);
  const c3 = pick(3, false);
  const c4 = pick(4, p.random() < 0.55);

  const angle = p.random(360);
  const s1 = p.random(0, 22);
  const s2 = p.random(28, 48);
  const s3 = p.random(52, 72);
  const background = `linear-gradient(${angle}deg, ${rgbToHex(c1.r, c1.g, c1.b)} ${s1}%, ${rgbToHex(c2.r, c2.g, c2.b)} ${s2}%, ${rgbToHex(c3.r, c3.g, c3.b)} ${s3}%, ${rgbToHex(c4.r, c4.g, c4.b)} 100%)`;

  return {
    background,
    backgroundBlendMode: 'normal',
  };
}

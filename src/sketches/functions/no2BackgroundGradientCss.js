/**
 * RectanglesNo2 backgrounds — a few restrained recipes (still not No1’s linear style).
 */

const chromaHex = (p, h, s, b) => {
  p.push();
  p.colorMode(p.HSB, 360, 100, 100);
  const hh = ((h % 360) + 360) % 360;
  const c = p.color(hh, p.constrain(s, 0, 100), p.constrain(b, 0, 100));
  const r = Math.round(p.red(c));
  const g = Math.round(p.green(c));
  const bl = Math.round(p.blue(c));
  p.pop();
  return `#${[r, g, bl]
    .map((x) => {
      const hex = x.toString(16);
      return hex.length === 1 ? `0${hex}` : hex;
    })
    .join('')}`;
};

const softConic = (p) => {
  const h0 = p.random(360);
  const c0 = chromaHex(p, h0, p.random(48, 72), p.random(42, 60));
  const c1 = chromaHex(p, h0 + p.random(35, 65), p.random(50, 75), p.random(40, 58));
  const c2 = chromaHex(p, h0 + p.random(85, 125), p.random(45, 72), p.random(38, 56));
  const c3 = chromaHex(p, h0 + p.random(150, 200), p.random(48, 70), p.random(40, 58));
  const cx = p.random(40, 60);
  const cy = p.random(40, 60);
  const from = p.random(360);
  return `conic-gradient(from ${from}deg at ${cx}% ${cy}%, ${c0}, ${c1}, ${c2}, ${c3}, ${c0})`;
};

const filmRadial = (p) => {
  const h = p.random(360);
  const edge = chromaHex(p, h + p.random(-12, 12), p.random(38, 58), p.random(30, 46));
  const mid = chromaHex(p, h + p.random(28, 48), p.random(45, 65), p.random(42, 56));
  const core = chromaHex(p, h + p.random(50, 85), p.random(42, 62), p.random(48, 64));
  const lin = `linear-gradient(${p.random(360)}deg, ${edge} 0%, ${mid} 50%, ${core} 100%)`;
  const rad = `radial-gradient(ellipse 78% 68% at ${p.random(44, 56)}% ${p.random(44, 56)}%, transparent 50%, rgba(0,0,0,0.18) 100%)`;
  return `${rad}, ${lin}`;
};

const angledDuo = (p) => {
  const h = p.random(360);
  const a = chromaHex(p, h, p.random(40, 62), p.random(38, 52));
  const b = chromaHex(p, h + p.random(55, 95), p.random(45, 68), p.random(44, 58));
  const ang = p.random(360);
  return `linear-gradient(${ang}deg, ${a} 0%, ${b} 100%)`;
};

/**
 * @returns {{ background: string, backgroundBlendMode: string }}
 */
export function getNo2BackgroundGradientCss(p) {
  const builders = [softConic, filmRadial, angledDuo];
  const layers = builders[p.floor(p.random(builders.length))](p);

  return {
    background: layers,
    backgroundBlendMode: 'normal',
  };
}

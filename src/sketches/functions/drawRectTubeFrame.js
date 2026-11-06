const applyEmissiveGlow = (p, c) => {
  p.noStroke();
  p.shininess(100);
  p.ambientMaterial(p.red(c) * 0.12, p.green(c) * 0.12, p.blue(c) * 0.12);
  p.specularMaterial(255, 245, 255);
  p.emissiveMaterial(p.red(c) * 0.92, p.green(c) * 0.92, p.blue(c) * 0.92);
  p.fill(c);
};

// Four tubes + four corner spheres, in the frame's own XY plane.
const buildFrame = (p, w, h, tubeR) =>
  p.buildGeometry(() => {
    const hw = w / 2 - tubeR;
    const hh = h / 2 - tubeR;
    const spanX = w - 2 * tubeR;
    const spanY = h - 2 * tubeR;
    for (const y of [-hh, hh]) {
      p.push();
      p.translate(0, y, 0);
      p.rotateZ(p.HALF_PI);
      p.cylinder(tubeR, spanX);
      p.pop();
    }
    for (const x of [-hw, hw]) {
      p.push();
      p.translate(x, 0, 0);
      p.cylinder(tubeR, spanY);
      p.pop();
    }
    for (const [x, y] of [
      [-hw, -hh],
      [hw, -hh],
      [-hw, hh],
      [hw, hh],
    ]) {
      p.push();
      p.translate(x, y, 0);
      p.sphere(tubeR, 12, 8);
      p.pop();
    }
  });

// One merged geometry per frame size: 1 draw call instead of 8 (headless
// capture runs on software GL, where draw calls are the cost). Sizes are
// quantised to 1% (≥ 0.5px) so breathing sizes reuse entries; LRU-capped.
const MAX_CACHED = 600;
const cache = new Map();
const quantise = (v, rel, min) => {
  const step = Math.max(min, Math.abs(v) * rel);
  return Math.round(v / step) * step;
};

const frameGeometry = (p, w, h, tubeR) => {
  const qw = quantise(w, 0.01, 0.5);
  const qh = quantise(h, 0.01, 0.5);
  const qr = Math.max(0.05, quantise(tubeR, 0.02, 0.05));
  const key = `${qw.toFixed(2)}|${qh.toFixed(2)}|${qr.toFixed(3)}`;
  let geom = cache.get(key);
  if (geom) {
    cache.delete(key);
  } else {
    geom = buildFrame(p, qw, qh, qr);
    // Let the current fill/material colour it, not colours baked at build time.
    geom.clearColors?.();
    if (cache.size >= MAX_CACHED) {
      const [oldKey, old] = cache.entries().next().value;
      cache.delete(oldKey);
      p.freeGeometry?.(old);
    }
  }
  cache.set(key, geom);
  return geom;
};

export const drawRectTubeFrame = (p, w, h, tubeR, c) => {
  if (w <= 2 * tubeR || h <= 2 * tubeR || tubeR <= 0) return;
  applyEmissiveGlow(p, c);
  p.model(frameGeometry(p, w, h, tubeR));
};

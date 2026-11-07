const applyEmissiveGlow = (p, c) => {
  p.noStroke();
  p.shininess(100);
  p.ambientMaterial(p.red(c) * 0.12, p.green(c) * 0.12, p.blue(c) * 0.12);
  p.specularMaterial(255, 245, 255);
  p.emissiveMaterial(p.red(c) * 0.92, p.green(c) * 0.92, p.blue(c) * 0.92);
  p.fill(c);
};

// Tubes are split into short segments: one long thin triangle per side
// rasterises its whole (rotated) bounding box on software GL, which made
// big frames cost seconds a frame headless. 10 sides read as round at
// these widths.
const SIDES = 10;
const segments = (span, tubeR) => Math.max(1, Math.min(64, Math.round(span / (tubeR * 6))));

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
      p.cylinder(tubeR, spanX, SIDES, segments(spanX, tubeR), false, false);
      p.pop();
    }
    for (const x of [-hw, hw]) {
      p.push();
      p.translate(x, 0, 0);
      p.cylinder(tubeR, spanY, SIDES, segments(spanY, tubeR), false, false);
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
      p.sphere(tubeR, SIDES, 6);
      p.pop();
    }
  });

// One merged geometry per frame SHAPE: 1 draw call instead of 8 (headless
// capture runs on software GL, where draw calls are the cost). The cache keys
// on aspect (0.5% steps) and tube-to-size ratio (3% steps), builds at a
// reference size and scales uniformly — so a frame that breathes in size
// reuses one entry instead of rebuilding every frame. LRU-capped.
const REF = 100;
const MAX_CACHED = 400;
const cache = new Map();
const LOG_ASPECT = Math.log(1.005);
const LOG_RATIO = Math.log(1.03);
const step = (v, logStep) => Math.round(Math.log(v) / logStep);

const frameGeometry = (p, aspectKey, ratioKey) => {
  const key = `${aspectKey}|${ratioKey}`;
  let geom = cache.get(key);
  if (geom) {
    cache.delete(key);
  } else {
    const aspect = Math.exp(aspectKey * LOG_ASPECT); // w / h
    const ratio = Math.exp(ratioKey * LOG_RATIO); // tubeR / min(w, h)
    const w = aspect >= 1 ? REF * aspect : REF;
    const h = aspect >= 1 ? REF : REF / aspect;
    geom = buildFrame(p, w, h, ratio * REF);
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
  const side = Math.min(w, h);
  const aspectKey = step(w / h, LOG_ASPECT);
  // Clamp below a half-side so the quantised tube always fits the frame.
  const ratioKey = Math.min(step(tubeR / side, LOG_RATIO), step(0.45, LOG_RATIO));
  applyEmissiveGlow(p, c);
  p.push();
  p.scale(side / REF);
  p.model(frameGeometry(p, aspectKey, ratioKey));
  p.pop();
};

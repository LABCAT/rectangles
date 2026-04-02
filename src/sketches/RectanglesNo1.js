import p5 from 'p5';
import '@lib/p5.audioReact.js';
import ColorGenerator from '@lib/p5.colorGenerator.js';
import { getFullWindowGradientCss } from '@lib/p5.circlesStyleFullWindowGradient.js';

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo1.mp3';
const midiUrl = base + 'audio/RectanglesNo1.mid';

const SQUARE_WAVE_STEPS = 240;
/** >1 nudges the 2×2 apart; ~1.06–1.12 keeps overlap without full edge contact. */
const FFT_RECT_GAP_MUL = 1.08;
/** Box-sample radius on waveform (reduces scratchy edge jitter). */
const RECT_WAVE_SMOOTH_R = 6;

/** DonutsNo2-style layered glow: ADD + thick core + thin echoes. */
const DONUTS_GLOW_CENTER_LAYER = 3;
const DONUTS_GLOW_LAYER_ORDER = [0, 1, 2, 4, 5, 6, 3];

/** Concentric rectangular rings from canvas center (CirclesNo9-style stack, axis-aligned); opacity = progress^exp. */
const FADE_RING_COUNT = 22;
const FADE_MAX_OPACITY = 1.05;
const FADE_INNER_FIRST_ALPHA_SCALE = 0.48;
const FADE_LAYER_FLOOR = 0.28;
const FADE_LAYER_RANGE = 0.48;
const FADE_OPACITY_EXP = 0.75;

const RECT_OUTLINE_EDGES = [
  { ax: -1, ay: -1, bx: 1, by: -1, nx: 0, ny: -1 },
  { ax: 1, ay: -1, bx: 1, by: 1, nx: 1, ny: 0 },
  { ax: 1, ay: 1, bx: -1, by: 1, nx: 0, ny: 1 },
  { ax: -1, ay: 1, bx: -1, by: -1, nx: -1, ny: 0 },
];

const normalize2 = (x, y) => {
  const len = Math.hypot(x, y) || 1;
  return { nx: x / len, ny: y / len };
};

/** Outward bisector at corners so each corner is one sample (avoids octagon chamfer). */
const rectOutlineNormal = (edgeIdx, t, isFullEdge) => {
  const e = RECT_OUTLINE_EDGES[edgeIdx];
  const prev = RECT_OUTLINE_EDGES[(edgeIdx + 3) % 4];
  const next = RECT_OUTLINE_EDGES[(edgeIdx + 1) % 4];
  if (isFullEdge) {
    if (t <= 0) return normalize2(prev.nx + e.nx, prev.ny + e.ny);
    if (t >= 1) return normalize2(e.nx + next.nx, e.ny + next.ny);
    return { nx: e.nx, ny: e.ny };
  }
  if (t >= 1) return normalize2(e.nx + next.nx, e.ny + next.ny);
  return { nx: e.nx, ny: e.ny };
};

const drawFftRectOutline = (p, waveSm, wlen, cx, cy, halfSide, baseColor) => {
  const rMax = halfSide * (0.36 / 0.22);
  const rMin = halfSide * (0.1 / 0.22);
  const stepsPerEdge = SQUARE_WAVE_STEPS / RECT_OUTLINE_EDGES.length;
  const perimeterPts = stepsPerEdge + (RECT_OUTLINE_EDGES.length - 1) * (stepsPerEdge - 1);
  const centerLayer = DONUTS_GLOW_CENTER_LAYER;
  const layerOrder = DONUTS_GLOW_LAYER_ORDER;
  const h0 = p.hue(baseColor);
  const s0 = p.saturation(baseColor);
  const b0 = p.brightness(baseColor);

  p.push();
  p.translate(cx, cy);
  p.blendMode(p.ADD);
  p.noFill();
  p.strokeCap(p.SQUARE);

  for (const geomScale of [1, 0.5]) {
    const L = halfSide * geomScale;
    for (const layer of layerOrder) {
      const distFromCenter = Math.abs(layer - centerLayer);
      const alpha = p.map(distFromCenter, 0, centerLayer, 0.8, 0.15);
      p.strokeWeight((layer === centerLayer ? 32 : 3) * geomScale);
      p.stroke((h0 + layer * 6) % 360, s0, b0, alpha);
      const layerOffset = (layer - centerLayer) * 2.2 * geomScale;

      let fx;
      let fy;
      let px0;
      let py0;
      let idx = 0;
      for (let e = 0; e < RECT_OUTLINE_EDGES.length; e++) {
        const { ax, ay, bx, by } = RECT_OUTLINE_EDGES[e];
        const full = e === 0;
        const sMax = full ? stepsPerEdge : stepsPerEdge - 1;
        for (let s = 0; s < sMax; s++) {
          const t = full ? s / (stepsPerEdge - 1) : (s + 1) / (stepsPerEdge - 1);
          const px = p.lerp(ax, bx, t);
          const py = p.lerp(ay, by, t);
          const atCorner =
            (e === 0 && (s === 0 || s === stepsPerEdge - 1)) || (e > 0 && s === sMax - 1);
          const { nx: nnx, ny: nny } = rectOutlineNormal(e, t, full);
          const wi = p.floor(p.map(idx, 0, perimeterPts - 1, 0, wlen - 1));
          idx++;
          const wv = waveSm[wi] ?? 0;
          const env = p.constrain(Math.abs(wv), 0, 1);
          const waveDisp = atCorner ? 0 : p.map(env, 0, 1, rMin * 0.12, rMax) * geomScale;
          const totalDisp = waveDisp + layerOffset;
          const x = px * L + nnx * totalDisp;
          const y = py * L + nny * totalDisp;
          if (idx === 1) {
            fx = x;
            fy = y;
            px0 = x;
            py0 = y;
          } else {
            p.line(px0, py0, x, y);
            px0 = x;
            py0 = y;
          }
        }
      }
      p.line(px0, py0, fx, fy);
    }
  }

  p.blendMode(p.BLEND);
  p.pop();
};

const applyBgGradient = (p) => {
  if (!p.bgGradientEl) return;
  const { background, backgroundBlendMode } = getFullWindowGradientCss(p);
  p.bgGradientEl.style.background = background;
  p.bgGradientEl.style.backgroundBlendMode = backgroundBlendMode;
};

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

  p.rectMode(p.CORNERS);
  const topH = iT - oT;
  if (topH > 0) p.rect(oL, oT, oR, iT);
  const botH = oB - iB;
  if (botH > 0) p.rect(oL, iB, oR, oB);
  const midH = iB - iT;
  const leftW = iL - oL;
  if (midH > 0 && leftW > 0) p.rect(oL, iT, iL, iB);
  const rightW = oR - iR;
  if (midH > 0 && rightW > 0) p.rect(iR, iT, oR, iB);
  p.rectMode(p.CORNER);
};

/** Stacked rings from center to viewport edge; outer rings darker (lighter center). */
const drawBlackFadeRectStack = (p, opacity) => {
  const w = p.width;
  const h = p.height;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const maxHw = w * 0.5;
  const maxHh = h * 0.5;
  const count = FADE_RING_COUNT;
  const innerFirst = false;
  const overlap = 0.05 / count;

  p.push();
  p.colorMode(p.RGB, 255);
  p.noStroke();
  for (let i = 0; i < count; i++) {
    const t0 = i / count;
    const t1 = Math.min(1, (i + 1) / count + overlap);
    const iw = t0 * maxHw;
    const ih = t0 * maxHh;
    const ow = t1 * maxHw;
    const oh = t1 * maxHh;

    const radialT = i / Math.max(1, count - 1);
    const layerT = innerFirst ? 1 - radialT : radialT;
    const a = p.constrain(
      opacity *
        FADE_MAX_OPACITY *
        (FADE_LAYER_FLOOR + FADE_LAYER_RANGE * layerT) *
        (innerFirst ? FADE_INNER_FIRST_ALPHA_SCALE : 1),
      0,
      1
    );
    p.fill(0, 0, 0, a * 255);
    drawFilledRectRing(p, cx, cy, iw, ih, ow, oh);
  }
  p.pop();
};

const drawBlackFadeRects = (p) => {
  const tPlay = p.getSongPlaybackTime();
  if (!Number.isFinite(tPlay)) return;

  let progress = 0;
  if (p.blackFade?.durationSec > 0) {
    const elapsed = (tPlay - p.blackFade.startSec) * 1000;
    progress = p.constrain(elapsed / (p.blackFade.durationSec * 1000), 0, 1);
  }

  drawBlackFadeRectStack(p, progress ** FADE_OPACITY_EXP);
};

const sketch = (p) => {
  p.fft = null;
  p.fftRectColors = null;
  p.bgGradientEl = null;
  p.introBlackCover = true;
  p.blackFade = { startSec: 0, durationSec: 0 };

  p.onTrack2Cue = function (note) {
    const durationSec = Math.max(
      0.06,
      note.duration ??
        (note.durationTicks && p.midiPpq
          ? (note.durationTicks / p.midiPpq) * (60 / (p.midiBpm || 120))
          : 0.22)
    ) * 1.4;

    

    if (note.midi === 36 || note.midi === 37) {
      const endMs = p.millis() + durationSec * 1000;
      p.drumsActiveUntilMs = Math.max(p.drumsActiveUntilMs, endMs);
    }
  };

  p.onTrack1Cue = function (note) {
    p.introBlackCover = false;
    const durationSec = Math.max(
      0.04,
      note.duration ??
        (note.durationTicks && p.midiPpq
          ? (note.durationTicks / p.midiPpq) * (60 / (p.midiBpm || 120))
          : 0.5)
    );
    const t = p.getSongPlaybackTime();
    if (Number.isFinite(t)) {
      p.blackFade = { startSec: t, durationSec };
    }
    applyBgGradient(this);
  };

  p.setup = async () => {
    p.pixelDensity(1);
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.clear();
    p.angleMode(p.DEGREES);
    p.colorMode(p.HSB, 360, 100, 100, 1);
    p.canvas.style.position = 'relative';
    p.canvas.style.zIndex = '1';
    p.canvas.style.background = 'transparent';

    const bgWrap = document.createElement('div');
    bgWrap.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
    p.bgGradientEl = document.createElement('div');
    p.bgGradientEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    bgWrap.appendChild(p.bgGradientEl);
    document.body.insertBefore(bgWrap, document.body.firstChild);
    p.randomSeed(Date.now());
    applyBgGradient(p);

    const midiData = await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = 143;
    });

    p.scheduleCueSet(midiData.tracks[2].notes, 'onTrack2Cue', true);
    p.scheduleCueSet(midiData.tracks[1].notes, 'onTrack1Cue');

    const baseHue = Math.random() * 360;
    const colorGen = new ColorGenerator(p, p.color(baseHue, 92, 94));
    p.fftRectColors = colorGen.getTetradic();

    p.fft = new p5.FFT();
    if (p.song) {
      p.song.disconnect();
      p.song.connect(p.fft);
      p.fft.gain.toDestination();
    }

    p.introBlackCover = true;
  };

  p.draw = () => {
    if (!p.fft) return;

    p.clear();

    if (p.introBlackCover) {
      drawBlackFadeRectStack(p, 1);
      return;
    }

    drawBlackFadeRects(p);

    p.fft.analyze();
    const wave = p.fft.waveform();
    if (!wave?.length) return;

    const wlen = wave.length;
    const waveSm = new Float32Array(wlen);
    const r = RECT_WAVE_SMOOTH_R;
    const denom = 2 * r + 1;
    for (let i = 0; i < wlen; i++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        sum += wave[(i + k + wlen) % wlen] ?? 0;
      }
      waveSm[i] = sum / denom;
    }

    if (!p.fftRectColors?.length) return;

    const layoutSize = p.min(p.width, p.height);
    const halfSide = layoutSize * 0.14;
    const cx = p.width * 0.5;
    const cy = p.height * 0.5;
    const idealHalfGap = p.height * 0.16 * FFT_RECT_GAP_MUL;
    const pad = halfSide * 2.5;
    const maxHalfX = p.min(cx - pad, p.width - cx - pad);
    const halfGapX = p.min(idealHalfGap, p.max(0, maxHalfX));
    const xL = cx - halfGapX;
    const xR = cx + halfGapX;
    const yT = cy - idealHalfGap;
    const yB = cy + idealHalfGap;
    const spots = [
      [xL, yT],
      [xR, yT],
      [xL, yB],
      [xR, yB],
    ];
    for (let i = 0; i < 4; i++) {
      const [rx, ry] = spots[i];
      drawFftRectOutline(p, waveSm, wlen, rx, ry, halfSide, p.fftRectColors[i]);
    }
  };

  p.mousePressed = () => {
    p.togglePlayback();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    p.perspective(p.PI / 2.75, p.width / p.height, 5, 20000);
  };
};

new p5(sketch);

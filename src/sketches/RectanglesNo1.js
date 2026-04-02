import p5 from 'p5';
import '@lib/p5.audioReact.js';
import ColorGenerator from '@lib/p5.colorGenerator.js';

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

const sketch = (p) => {
  p.fft = null;
  p.fftRectColors = null;

  p.onTrack2Cue = function (note) {
    const durationSec = Math.max(
      0.06,
      note.duration ??
        (note.durationTicks && p.midiPpq
          ? (note.durationTicks / p.midiPpq) * (60 / (p.midiBpm || 120))
          : 0.22)
    ) * 1.4;

    console.log(note.midi);
    

    if (note.midi === 36 || note.midi === 37) {
      const endMs = p.millis() + durationSec * 1000;
      p.drumsActiveUntilMs = Math.max(p.drumsActiveUntilMs, endMs);
    }
  };

  p.setup = async () => {
    p.pixelDensity(1);
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.angleMode(p.DEGREES);
    p.colorMode(p.HSB, 360, 100, 100, 1);
    p.canvas.style.position = 'relative';
    p.canvas.style.zIndex = '1';

    const midiData = await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = data.header.tempos[0]?.bpm ?? 120;
    });

    p.scheduleCueSet(midiData.tracks[2].notes, 'onTrack2Cue', true);

    const baseHue = Math.random() * 360;
    const colorGen = new ColorGenerator(p, p.color(baseHue, 92, 94));
    p.fftRectColors = colorGen.getTetradic();

    p.fft = new p5.FFT();
    if (p.song) {
      p.song.disconnect();
      p.song.connect(p.fft);
      p.fft.gain.toDestination();
    }
  };

  p.draw = () => {
    if (!p.fft || !p.song?.isPlaying?.()) return;
    p.background(0, 0, 5);

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
      const [cx, cy] = spots[i];
      drawFftRectOutline(p, waveSm, wlen, cx, cy, halfSide, p.fftRectColors[i]);
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

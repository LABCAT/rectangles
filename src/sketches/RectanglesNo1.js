import p5 from 'p5';
import '@lib/p5.audioReact.js';
import { drawRectTubeFrame } from '@lib/p5.rectTubeFrame.js';

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo1.mp3';
const midiUrl = base + 'audio/RectanglesNo1.mid';

const NOTES_PER_PHRASE = 26;
const TRACK2_KICK_NOTE = 36;
const TRACK2_SNARE_NOTE = 37;
const DEPTH_PUSH = 1;
const CAMERA_RADIUS_MULT = 6.1;
const SQUARE_WAVE_STEPS = 240;
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
const SQUARE_WAVE_LAYERS = [0, 1, 2, 4, 5, 6, 3];
const SQUARE_WAVE_CENTER_LAYER = 3;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

const squareOutlinePoint = (frac) => {
  const u = frac * 4;
  if (u < 1) {
    const s = u;
    return { px: s * 2 - 1, py: -1, nx: 0, ny: -1 };
  }
  if (u < 2) {
    const s = u - 1;
    return { px: 1, py: s * 2 - 1, nx: 1, ny: 0 };
  }
  if (u < 3) {
    const s = u - 2;
    return { px: 1 - s * 2, py: 1, nx: 0, ny: 1 };
  }
  const s = u - 3;
  return { px: -1, py: 1 - s * 2, nx: -1, ny: 0 };
};

const sketch = (p) => {
  p.midiFrames = [];
  p.depthAnim = null;
  p.pendingPhraseClear = false;
  p.pendingFirstFrame = null;
  p.track2BaseHue = 0;
  p.track2HueCurrent = 0;
  p.track2HueTarget = 0;
  p.track2Pulse = 0;
  p.phraseSpans = [];
  p.cameraAngle = 0;
  p.cameraAngleTarget = 0;
  p.fft = null;
  p.track2SquareBursts = [];

  const buildRandomFrame = () => {
    const w = p.random(65, 220) * 24;
    const h = p.random(45, 200) * 24;
    const tube = p.constrain(p.random(2.8, Math.min(w, h) * 0.2), 2.5, 16);
    const xMax = p.width * 1.5;
    const yMax = p.height * 1.5;
    const zSpan = p.max(p.width, p.height) * 6 * DEPTH_PUSH;
    return {
      x: p.random(-xMax, xMax),
      y: p.random(-yMax, yMax),
      z: p.random(-zSpan * 0.5, zSpan * 0.5),
      rx: p.random(p.TWO_PI),
      ry: p.random(p.TWO_PI),
      rz: p.random(p.TWO_PI),
      w,
      h,
      tube,
      hue: p.random(360),
    };
  };

  p.onTrack2Cue = function (note) {
    const durationSec = Math.max(
      0.06,
      note.duration ??
        (note.durationTicks && p.midiPpq
          ? (note.durationTicks / p.midiPpq) * (60 / (p.midiBpm || 120))
          : 0.22)
    );
    const accent =
      note.midi === TRACK2_KICK_NOTE ? 1 : note.midi === TRACK2_SNARE_NOTE ? 0.82 : 0.55;
    p.track2SquareBursts.push({
      startMs: p.millis(),
      durationMs: durationSec * 1000,
      hueJitter: p.random(-28, 28),
      accent,
    });

    if (note.midi === TRACK2_KICK_NOTE) {
      p.track2BaseHue = p.random(360);
      p.track2HueTarget = p.track2BaseHue;
      p.track2Pulse = p.max(p.track2Pulse, 0.85);
      return;
    }

    if (note.midi === TRACK2_SNARE_NOTE) {
      p.track2HueTarget = (p.track2BaseHue + 180) % 360;
      p.track2Pulse = p.max(p.track2Pulse, 0.65);
    }
  };

  p._drawSquareWaveBillboard = function (camX, camY, camZ, alphaScale, hueBase) {
    if (!p.fft) return;
    p.fft.analyze();
    const wave = p.fft.waveform();
    if (!wave?.length) return;

    const camLen = Math.hypot(camX, camY, camZ) || 1;
    const nx = camX / camLen;
    const ny = camY / camLen;
    const nz = camZ / camLen;
    const bx = -nx * camLen * 1.22;
    const by = -ny * camLen * 1.22;
    const bz = -nz * camLen * 1.22;
    let ux = 0;
    let uy = 1;
    let uz = 0;
    let tx = uy * nz - uz * ny;
    let ty = uz * nx - ux * nz;
    let tz = ux * ny - uy * nx;
    let tlen = Math.hypot(tx, ty, tz);
    if (tlen < 1e-4) {
      ux = 1;
      uy = 0;
      uz = 0;
      tx = uy * nz - uz * ny;
      ty = uz * nx - ux * nz;
      tz = ux * ny - uy * nx;
      tlen = Math.hypot(tx, ty, tz);
    }
    tx /= tlen;
    ty /= tlen;
    tz /= tlen;
    const sx = ny * tz - nz * ty;
    const sy = nz * tx - nx * tz;
    const sz = nx * ty - ny * tx;
    const size = p.max(p.width, p.height) * 5.2;
    const rMin = size * 0.08;
    const rMax = size * 0.52;

    p.push();
    p.translate(bx, by, bz);
    p.blendMode(p.ADD);
    p.noFill();
    p.strokeCap(p.ROUND);

    for (const scale of [1, 0.52]) {
      for (const layer of SQUARE_WAVE_LAYERS) {
        const distFromCenter = Math.abs(layer - SQUARE_WAVE_CENTER_LAYER);
        const layerAlpha = p.map(distFromCenter, 0, SQUARE_WAVE_CENTER_LAYER, 0.82, 0.14);
        const strokeW = (layer === SQUARE_WAVE_CENTER_LAYER ? 26 : 3.2) * scale;
        const offset = (layer - SQUARE_WAVE_CENTER_LAYER) * 2.1 * scale;
        const h = (hueBase + 40 + layer * 6) % 360;
        const strokeA = p.constrain(layerAlpha * alphaScale, 0, 1);
        p.stroke(h, 78, 100, strokeA);
        p.strokeWeight(strokeW);
        p.beginShape();
        for (let i = 0; i <= SQUARE_WAVE_STEPS; i++) {
          const frac = i / SQUARE_WAVE_STEPS;
          const { px, py, nx: nnx, ny: nny } = squareOutlinePoint(frac);
          const wi = Math.floor(p.map(i, 0, SQUARE_WAVE_STEPS, 0, wave.length - 1));
          const samp = wave[wi] ?? 0;
          const disp = p.map(samp, -1, 1, rMin, rMax) + offset;
          const Px = px * size * 0.5 + nnx * disp;
          const Py = py * size * 0.5 + nny * disp;
          p.vertex(tx * Px + sx * Py, ty * Px + sy * Py, tz * Px + sz * Py);
        }
        p.endShape(p.CLOSE);
      }
    }

    p.blendMode(p.BLEND);
    p.pop();
  };

  p.onTrack3Cue = function (note) {
    const isPhraseEnd =
      note.currentCue > 0 &&
      note.currentCue % NOTES_PER_PHRASE === NOTES_PER_PHRASE - 1;
    if (isPhraseEnd) {
      const durationSec = Math.max(
        0.04,
        note.duration ??
          (note.durationTicks && p.midiPpq
            ? (note.durationTicks / p.midiPpq) * (60 / (p.midiBpm || 120))
            : 0.5)
      );
      p.depthAnim = {
        startMs: p.millis(),
        durationMs: durationSec * 1000,
        scatterRadius: p.max(p.width, p.height) * 16,
      };
      return;
    }

    const isPhraseStart = (note.currentCue - 1) % NOTES_PER_PHRASE === 0;
    if (isPhraseStart) {
      if (note.currentCue === 1) {
        p.midiFrames = [];
      } else if (p.depthAnim) {
        const elapsed = p.millis() - p.depthAnim.startMs;
        if (elapsed < p.depthAnim.durationMs) {
          p.pendingPhraseClear = true;
          p.pendingFirstFrame = buildRandomFrame();
          return;
        }
        p.midiFrames = [];
      } else {
        p.midiFrames = [];
      }
    }

    p.midiFrames.push(buildRandomFrame());
  };

  p.setup = async () => {
    p.pixelDensity(1);
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.angleMode(p.DEGREES);
    p.colorMode(p.HSB, 360, 100, 100, 1);
    p.track2BaseHue = p.random(360);
    p.track2HueCurrent = p.track2BaseHue;
    p.track2HueTarget = p.track2BaseHue;
    p.canvas.style.position = 'relative';
    p.canvas.style.zIndex = '1';
    // p.perspective(p.PI / 2.75, p.width / p.height, 5, 20000);

    const midiData = await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = data.header.tempos[0]?.bpm ?? 120;
    });

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

    const size = p.min(p.width, p.height);
    const rMax = size * 0.36;
    const rMin = size * 0.1;
    const halfSide = size * 0.22;

    p.push();
    p.translate(p.width / 2, p.height / 2);
    p.blendMode(p.ADD);
    p.noFill();
    p.strokeCap(p.SQUARE);

    const stepsPerEdge = SQUARE_WAVE_STEPS / RECT_OUTLINE_EDGES.length;
    const perimeterPts = stepsPerEdge + (RECT_OUTLINE_EDGES.length - 1) * (stepsPerEdge - 1);
    const hueBase = p.track2HueCurrent;
    const centerLayer = DONUTS_GLOW_CENTER_LAYER;
    const layerOrder = DONUTS_GLOW_LAYER_ORDER;

    for (const geomScale of [1, 0.5]) {
      const L = halfSide * geomScale;
      for (const layer of layerOrder) {
        const distFromCenter = Math.abs(layer - centerLayer);
        const alpha = p.map(distFromCenter, 0, centerLayer, 0.8, 0.15);
        p.strokeWeight((layer === centerLayer ? 32 : 3) * geomScale);
        p.stroke((hueBase + layer * 6) % 360, 75, 100, alpha);
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

  // p.draw = () => {
  //   const t = p.millis() * 0.001;
  //   const orbit = p.max(p.width, p.height) * 0.72;
  //   const hueDelta = ((p.track2HueTarget - p.track2HueCurrent + 540) % 360) - 180;
  //   p.track2HueCurrent = (p.track2HueCurrent + hueDelta * 0.2 + 360) % 360;
  //   p.track2Pulse = p.max(0, p.track2Pulse - 0.025);
  //   const bgLightness = 8 + p.track2Pulse * 28;
  //   const bgSaturation = 70 + p.track2Pulse * 20;
  //   const bgColor = p.color(
  //     `hsl(${p.track2HueCurrent.toFixed(1)}, ${bgSaturation.toFixed(1)}%, ${bgLightness.toFixed(1)}%)`
  //   );

  //   const audioTimeSec = p.getSongPlaybackTime();
  //   if (Number.isFinite(audioTimeSec) && p.phraseSpans.length) {
  //     for (const span of p.phraseSpans) {
  //       if (audioTimeSec >= span.start && audioTimeSec < span.end) {
  //         const phraseProgress = p.constrain(
  //           (audioTimeSec - span.start) / Math.max(0.001, span.end - span.start),
  //           0,
  //           1
  //         );
  //         p.cameraAngleTarget = phraseProgress * p.TWO_PI;
  //         break;
  //       }
  //     }
  //   }
  //   const angleDelta = ((p.cameraAngleTarget - p.cameraAngle + p.PI * 3) % p.TWO_PI) - p.PI;
  //   p.cameraAngle = (p.cameraAngle + angleDelta * 0.12 + p.TWO_PI) % p.TWO_PI;
  //   const camRadius = p.max(p.width, p.height) * CAMERA_RADIUS_MULT;
  //   const camX = Math.cos(p.cameraAngle) * camRadius;
  //   const camZ = Math.sin(p.cameraAngle) * camRadius;
  //   const camY = Math.sin(t * 0.35) * camRadius * 0.12;
  //   p.camera(camX, camY, camZ, 0, 0, 0, 0, 1, 0);

  //   p.background(0);

  //   if (p.song?.isPlaying?.() && p.fft && p.track2SquareBursts.length) {
  //     p.push();
  //     p.colorMode(p.HSB, 360, 100, 100, 1);
  //     const alive = [];
  //     for (const burst of p.track2SquareBursts) {
  //       const life = (p.millis() - burst.startMs) / burst.durationMs;
  //       if (life >= 1) continue;
  //       alive.push(burst);
  //       const fade = (1 - life) ** 0.45;
  //       p._drawSquareWaveBillboard(
  //         camX,
  //         camY,
  //         camZ,
  //         burst.accent * fade * 0.95,
  //         (p.track2HueCurrent + burst.hueJitter + 360) % 360
  //       );
  //     }
  //     p.track2SquareBursts = alive;
  //     p.pop();
  //   }

  //   p.colorMode(p.RGB, 255);

  //   const amb = 22 + p.sin(t * 0.35) * 14;
  //   p.ambientLight(amb * 0.45, amb * 0.35, amb * 0.75);

  //   const lx1 = p.sin(t * 0.62) * orbit;
  //   const lz1 = p.cos(t * 0.62) * orbit * 0.85;
  //   p.pointLight(255, 90, 180, lx1, p.cos(t * 0.48) * orbit * 0.35, 320 + lz1);

  //   const lx2 = p.sin(t * 0.48 + p.PI * 0.65) * orbit;
  //   const lz2 = p.cos(t * 0.48 + p.PI * 0.65) * orbit * 0.9;
  //   p.pointLight(80, 200, 255, lx2, p.sin(t * 0.55) * orbit * 0.4, 280 + lz2);

  //   const lx3 = p.sin(t * 0.28) * orbit * 0.55;
  //   const ly3 = p.cos(t * 0.33) * orbit * 0.5;
  //   p.pointLight(255, 220, 140, lx3, ly3, 480 + p.sin(t * 0.4) * 120);

  //   p.directionalLight(40, 70, 120, -0.35, 0.4, -0.85);
  //   p.directionalLight(90, 40, 110, 0.5, -0.2, -0.75);

  //   const frames = p.midiFrames;
  //   let depthAnim = p.depthAnim;
  //   let scatterEase = null;
  //   let scatterRadius = 0;
  //   if (depthAnim) {
  //     const elapsed = p.millis() - depthAnim.startMs;
  //     scatterEase = p.constrain(elapsed / depthAnim.durationMs, 0, 1);
  //     scatterRadius = depthAnim.scatterRadius;
  //     if (scatterEase >= 1) {
  //       p.depthAnim = null;
  //       scatterEase = null;
  //       if (p.pendingPhraseClear) {
  //         p.midiFrames = [];
  //         p.pendingPhraseClear = false;
  //         if (p.pendingFirstFrame) {
  //           p.midiFrames.push(p.pendingFirstFrame);
  //           p.pendingFirstFrame = null;
  //         }
  //       }
  //     }
  //   }

  //   for (let i = 0; i < frames.length; i++) {
  //     const f = frames[i];
  //     let x = f.x;
  //     let y = f.y;
  //     let z = f.z;
  //     if (scatterEase != null) {
  //       const eased = easeOutCubic(scatterEase);
  //       const orbitAngle = (i / Math.max(1, frames.length)) * p.TWO_PI + t * 0.35;
  //       const wave = 0.7 + 0.3 * Math.sin(orbitAngle * 2.3 + f.hue * 0.02);
  //       const r = scatterRadius * wave;
  //       const sx = Math.cos(orbitAngle) * r;
  //       const sy = Math.sin(orbitAngle * 1.7 + f.ry) * r * 0.35;
  //       const sz = Math.sin(orbitAngle) * r;
  //       x = p.lerp(sx, f.x, eased);
  //       y = p.lerp(sy, f.y, eased);
  //       z = p.lerp(sz, f.z, eased);
  //     }
  //     p.push();
  //     p.translate(x, y, z);
  //     if (f.rx) p.rotateX(f.rx);
  //     if (f.ry) p.rotateY(f.ry);
  //     if (f.rz) p.rotateZ(f.rz);
  //     const c = p.color(`hsl(${f.hue}, 100%, 52%)`);
  //     drawRectTubeFrame(p, f.w, f.h, f.tube, c);
  //     p.pop();
  //   }
  // };

  p.mousePressed = () => {
    p.togglePlayback();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    p.perspective(p.PI / 2.75, p.width / p.height, 5, 20000);
  };
};

new p5(sketch);

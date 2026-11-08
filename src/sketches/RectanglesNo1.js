import p5 from 'p5';
import '@lib/p5.audioReact.js';
import ColorGenerator from '@lib/p5.colorGenerator.js';
import initCapture from '@labcat2020/p5.audioreactive-capture';
import { createDomLayerCaptureBackground } from '@labcat2020/p5.audioreactive-capture/dom-layer';
import { compositeDomCaptureExtension } from '@labcat2020/p5.audioreactive-capture/composite';
import { getFullWindowGradientCss } from '@sketches/functions/fullWindowGradientCss.js';
import { readReelParams, applyPart, randomSeed } from '../lib/reelParams.js';
import { createNo1Look, NO1_PARTS, NO1_BPM } from '../lib/no1Look.js';

// Reels: ?seed= picks a reproducible variation (rectangle hues, background
// gradients, swell rates; no seed = a random one, logged to the console);
// ?part=a|b plays and loops just that part's bars (see NO1_PARTS), and sets
// p.captureRange so a capture renders just that section. Prev/next in the
// control panel walk the parts, and next on the last part goes on to
// RectanglesNo2. With no ?part the page plays part A (a capture without ?part
// still renders the whole track). N / P step the seed, R picks a random one.
// The address bar follows (?part=&seed=).

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo1.mp3';
const midiUrl = base + 'audio/RectanglesNo1.mid';

const SQUARE_WAVE_STEPS = 240;
/** >1 nudges the 2×2 apart; ~1.06–1.12 keeps overlap without full edge contact. */
const FFT_RECT_GAP_MUL = 1.08;
/** Box-sample radius on waveform (reduces scratchy edge jitter). */
const RECT_WAVE_SMOOTH_R = 6;
/** Long track-3 notes: half-side starts at 0 and grows (px per 60fps frame) only while the MIDI gate is open. */
const FFT_RECT_LONG_NOTE_TICKS = 50000;
/** Minimum half-side growth per frame; at ~1900×1000 canvas area the effective rate matches this value. */
const FFT_RECT_HALF_SIDE_GROW_PX = 8;
const FFT_RECT_HALF_SIDE_GROW_REF_AREA = 1900 * 1000;

const fftRectHalfSideGrowPxPerFrame = (p) => {
  const area = Math.max(1, p.width * p.height);
  const scale = Math.sqrt(area / FFT_RECT_HALF_SIDE_GROW_REF_AREA);
  return FFT_RECT_HALF_SIDE_GROW_PX * Math.max(1, scale);
};

const noteDurationSec = (p, note, fallbackSec) =>
  Math.max(
    0.02,
    note.duration ??
      (note.durationTicks && p.midiPpq
        ? (note.durationTicks / p.midiPpq) * (60 / (p.midiBpm || 120))
        : fallbackSec)
  );

const mergeFftGate = (p, idx, s, e) => {
  const curE = p.fftRectGateEndSec[idx];
  if (curE <= 0 || s >= curE - 1e-4) {
    p.fftRectGateStartSec[idx] = s;
    p.fftRectGateEndSec[idx] = e;
  } else {
    p.fftRectGateEndSec[idx] = Math.max(curE, e);
  }
};

/** DonutsNo2-style layered glow: ADD + thick core + thin echoes. */
const DONUTS_GLOW_CENTER_LAYER = 3;
const DONUTS_GLOW_LAYER_ORDER = [0, 1, 2, 4, 5, 6, 3];

/** Concentric rectangular rings from canvas center (CirclesNo9-style stack, axis-aligned); opacity = progress^exp. */
const FADE_RING_COUNT = 22;
const FADE_MAX_OPACITY = 1.05;
const FADE_INNER_FIRST_ALPHA_SCALE = 0.48;
const FADE_LAYER_FLOOR = 0.28;
const FADE_LAYER_RANGE = 0.48;
/** Lower bound of the stack during an active track-1 fade segment only (else level stays 1). */
const FADE_BASE_STACK_OPACITY = 0.22;
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
  document.documentElement.style.setProperty('--gradient-bg', background);
  document.documentElement.style.setProperty('--gradient-blend-mode', backgroundBlendMode || 'normal');
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
  let level = 1;
  const dur = p.blackFade?.durationSec ?? 0;
  if (Number.isFinite(tPlay) && dur > 0) {
    const t0 = p.blackFade.startSec;
    const t1 = t0 + dur;
    if (tPlay >= t0 && tPlay < t1) {
      const progress = p.constrain((tPlay - t0) / dur, 0, 1);
      const pulse = progress ** FADE_OPACITY_EXP;
      level = FADE_BASE_STACK_OPACITY + (1 - FADE_BASE_STACK_OPACITY) * pulse;
    }
  }

  drawBlackFadeRectStack(p, level);
};

const sketch = (p) => {
  const reel = readReelParams(window.location.search);
  let look = createNo1Look(reel.seed);
  p.reelSeed = look.seed;

  p.fft = null;
  p.fftRectColors = null;
  p.bgGradientEl = null;
  /** Cue-driven state, as it is before the first note. */
  const resetCueState = () => {
    p.blackFade = { startSec: 0, durationSec: 0 };
    p.fftRectGateStartSec = [0, 0, 0, 0];
    p.fftRectGateEndSec = [0, 0, 0, 0];
    p.fftRectGrowHalfSide = [null, null, null, null];
    p.fftRectGrowHalfSideRate = [1, 1, 1, 1];
    p.fftRectGrowStartSec = [0, 0, 0, 0];
  };
  resetCueState();
  /** ?part's { start, end } in seconds (set in setup), and whether it has started playing. */
  let partRange = null;
  let partStarted = false;

  p.onTrack11Cue = function (note) {
    const s = note.time;
    const e = s + noteDurationSec(p, note, 0.22);
    const longNote = (note.durationTicks ?? 0) > FFT_RECT_LONG_NOTE_TICKS;

    if (Number(note.currentCue) % 25 === 1 || longNote) {
      for (let i = 0; i < 4; i++) {
        p.fftRectGateStartSec[i] = s;
        p.fftRectGateEndSec[i] = e;
        if (longNote) {
          p.fftRectGrowHalfSide[i] = 0;
          p.fftRectGrowStartSec[i] = s;
          p.fftRectGrowHalfSideRate[i] = look.growRate(note.currentCue, i, true);
        } else {
          p.fftRectGrowHalfSide[i] = null;
        }
      }
      return;
    }
    const c = note.currentCue ?? 1;
    const idx = (c - 1) % 4;
    mergeFftGate(p, idx, s, e);
    if (longNote) {
      p.fftRectGrowHalfSide[idx] = 0;
      p.fftRectGrowStartSec[idx] = s;
      p.fftRectGrowHalfSideRate[idx] = look.growRate(c, idx, false);
    } else {
      p.fftRectGrowHalfSide[idx] = null;
    }
  };

  p.onTrack1Cue = function (note) {
    const durationSec = Math.max(
      0.04,
      note.duration ??
        (note.durationTicks && p.midiPpq
          ? (note.durationTicks / p.midiPpq) * (60 / (p.midiBpm || 120))
          : 0.5)
    );
    // The chord's own time (not the clock), so cues replayed ahead of a part land the same.
    const t = Number.isFinite(note.time) ? note.time : p.getSongPlaybackTime();
    if (Number.isFinite(t)) {
      p.blackFade = { startSec: t, durationSec };
    }
    // Each chord's gradient comes from (seed, cue), whatever ran before it.
    p.randomSeed(look.bgSeed(note.currentCue));
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
    p.bgWrapperEl = bgWrap;
    initCapture(p, {
      prefix: 'RectanglesNo1',
      enabled: false,
      captureCSSBackground: true,
      extension: compositeDomCaptureExtension({ background: createDomLayerCaptureBackground(bgWrap) }),
    });
    // Frames depend on song time alone (cues, buffer waveform, time-based swell), so a
    // section cut can skip the draws before its start.
    p.captureSeekable = true;
    partRange = applyPart(p, NO1_PARTS, partId, { bpm: NO1_BPM });
    // Live play defaults to part A; a capture only narrows to a part ?part names.
    if (!reel.part) p.captureRange = null;
    p.loopAudio = !!partRange;
    syncUrl();
    logLook();
    p.randomSeed(look.bgSeed(0));
    applyBgGradient(p);

    const midiData = await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = NO1_BPM;
    });

    if (midiData?.tracks) {
      p.scheduleCueSet(midiData.tracks[11]?.notes ?? [], 'onTrack11Cue', true);
      p.scheduleCueSet(midiData.tracks[1]?.notes ?? [], 'onTrack1Cue');
    }

    p.fftRectColors = rectColors();
    guardStaleStops();
    if (partRange) p._playbackFrozenSec = partRange.start;
    emitTrack();
    window.addEventListener('labcat:track-prev', () => stepPart(-1));
    window.addEventListener('labcat:track-next', () => stepPart(1));
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n') stepSeed(1);
      else if (k === 'p') stepSeed(-1);
      else if (k === 'r') setSeed(randomSeed());
    });

    p.fft = new p5.FFT();
    if (p.song) {
      p.song.disconnect();
      p.song.connect(p.fft);
      p.fft.gain.toDestination();
    }
  };

  // --- Parts, seeds and the address bar -------------------------------------

  const PART_IDS = Object.keys(NO1_PARTS);
  const PART_TITLES = { a: 'Part A · groove', b: 'Part B · breakdown' };
  let partId = NO1_PARTS[reel.part] ? reel.part : PART_IDS[0];
  /** Next after the last part: the series' next sketch. */
  const NEXT_SKETCH_URL = `${base}number-2/?part=a`;

  const rectColors = () => new ColorGenerator(p, p.color(look.baseHue, 92, 94)).getTetradic();

  const syncUrl = () => {
    const q = new URLSearchParams(window.location.search);
    if (partId) q.set('part', partId);
    else q.delete('part');
    q.set('seed', look.seed);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  };

  const emitTrack = () => {
    const title = PART_TITLES[partId] ?? `Part ${partId.toUpperCase()}`;
    window.dispatchEvent(new CustomEvent('labcat:track', { detail: { title } }));
  };

  const logLook = () =>
    console.log(`[RectanglesNo1] seed ${look.seed} · ${look.palette} · turn ${look.turn}${partId ? ` · part ${partId}` : ''}`);

  // Rebuild the cue-driven state at song time `t`, as a capture would have it:
  // reset, then fire every cue before `t` at once.
  const replayCuesBefore = (t) => {
    resetCueState();
    p.randomSeed(look.bgSeed(0));
    applyBgGradient(p);
    const before = (p._midiTransportCues ?? []).filter((c) => c.time < t).sort((a, b) => a.time - b.time);
    for (const { fn, note } of before) fn.call(p, note);
  };

  // Tone's Player fires p5.sound's onended (its onstop) for every source that
  // stops, and a seek stops the old source, so the lib would take a seek for
  // the song ending (and with loopAudio, each restart's stop() fires it again,
  // forever). The stale event can land >1s late on a busy machine, so a timer
  // can't fence it: count the sources each jump stops and swallow that many.
  let staleStops = 0;
  const guardStaleStops = () => {
    const sf = p.song?.soundfile;
    if (!sf || sf._no1Guarded) return;
    sf._no1Guarded = true;
    const libOnStop = sf.onstop;
    sf.onstop = function (...args) {
      if (staleStops > 0) {
        staleStops--;
        return;
      }
      return libOnStop?.apply(this, args);
    };
  };

  // Make the next play() start the audio at `sec` instead of 0.
  const startNextPlayAt = (sec) => {
    const sf = p.song?.soundfile;
    if (!sf?.start) return;
    const start = sf.start;
    sf.start = function (time, offset, duration) {
      sf.start = start;
      return start.call(this, time, offset ?? sec, duration);
    };
  };

  // Move audio, clock and cue state to `sec`, playing, paused or before the first play.
  const jumpTo = (sec) => {
    replayCuesBefore(sec);
    const sf = p.song?.soundfile;
    if (sf?.state === 'started' && p.song.isPlaying()) {
      const sources = sf._activeSources?.size ?? 1;
      try {
        sf.seek(sec);
        staleStops += sources;
      } catch (e) {
        console.warn('[RectanglesNo1] seek failed', e);
      }
    } else if (sf?.state === 'started') {
      // Paused (p5.sound pauses at rate 0): a seek would start a zero-rate
      // source that Tone ends at once. Stop cleanly; the next play starts at `sec`.
      staleStops += sf._activeSources?.size ?? 1;
      sf.stop();
      p.song.paused = false;
      p.song.playing = false;
      startNextPlayAt(sec);
    } else {
      startNextPlayAt(sec);
    }
    if (p.song?.isPlaying()) {
      p._playbackSongSecondsAtWallStart = sec;
      p._playbackWallStartPerf = performance.now();
      p._reindexMidiCues(sec);
    } else {
      p._playbackFrozenSec = sec;
    }
  };

  const setPart = (id) => {
    partId = id;
    partRange = applyPart(p, NO1_PARTS, id, { bpm: NO1_BPM });
    p.loopAudio = !!partRange;
    syncUrl();
    emitTrack();
    logLook();
    if (!partRange) return;
    partStarted = !!p.song?.soundfile && p.song.soundfile.state === 'started';
    if (partStarted) jumpTo(partRange.start);
    else p._playbackFrozenSec = partRange.start;
  };

  // Prev on the first part restarts it; next on the last goes to RectanglesNo2.
  const stepPart = (d) => {
    const next = PART_IDS.indexOf(partId) + d;
    if (next >= PART_IDS.length) {
      window.location.assign(NEXT_SKETCH_URL);
      return;
    }
    setPart(PART_IDS[Math.max(0, next)]);
  };

  // A new seed shows at once: new colours, and the cues so far replayed with it.
  const setSeed = (next) => {
    look = createNo1Look(String(next));
    p.reelSeed = look.seed;
    if (p.fftRectColors) p.fftRectColors = rectColors();
    const t = p.getSongPlaybackTime();
    replayCuesBefore(Number.isFinite(t) ? t : 0);
    syncUrl();
    logLook();
  };

  const stepSeed = (d) => {
    const n = Number(look.seed);
    setSeed(Number.isInteger(n) ? Math.max(0, n + d) : randomSeed());
  };

  const togglePlaybackBase = p.togglePlayback.bind(p);
  p.togglePlayback = () => {
    if (partRange && !partStarted && p.audioLoaded && p.song && !p.captureEnabled && !p.song.isPlaying()) {
      partStarted = true;
      replayCuesBefore(partRange.start);
      p._playbackFrozenSec = partRange.start;
      startNextPlayAt(partRange.start);
    }
    togglePlaybackBase();
  };

  p.draw = () => {
    if (!p.fft) return;

    if (partRange && !p.captureInProgress && p.song?.isPlaying() && p.getSongPlaybackTime() >= partRange.end) {
      jumpTo(partRange.start);
    }

    p.clear();

    drawBlackFadeRects(p);

    p.fft.analyze();
    let wave = p.fft.waveform();
    if (!wave?.length) wave = new Float32Array(1024);

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

    const tPlay = p.getSongPlaybackTime();
    const silent = new Float32Array(wlen);

    const layoutSize = p.min(p.width, p.height);
    const halfSide = layoutSize * 0.14;
    const cx = p.width * 0.5;
    const cy = p.height * 0.5;
    const idealHalfGap = layoutSize * 0.16 * FFT_RECT_GAP_MUL;
    const pad = halfSide * 2.5;
    const maxHalfX = p.min(cx - pad, p.width - cx - pad);
    const maxHalfY = p.min(cy - pad, p.height - cy - pad);
    const halfGapX = p.min(idealHalfGap, p.max(0, maxHalfX));
    const halfGapY = p.min(idealHalfGap, p.max(0, maxHalfY));
    const xL = cx - halfGapX;
    const xR = cx + halfGapX;
    const yT = cy - halfGapY;
    const yB = cy + halfGapY;
    const spots = [
      [xL, yT],
      [xR, yT],
      [xL, yB],
      [xR, yB],
    ];
    for (let i = 0; i < 4; i++) {
      const [rx, ry] = spots[i];
      const gated =
        Number.isFinite(tPlay) &&
        tPlay >= p.fftRectGateStartSec[i] &&
        tPlay < p.fftRectGateEndSec[i];
      const src = gated ? waveSm : silent;
      let hs = halfSide;
      if (typeof p.fftRectGrowHalfSide[i] === 'number') {
        // Swell = open-gate time since the long note × the per-frame rate at 60fps: a
        // function of song time, so live play, full captures and section cuts match.
        const t0 = p.fftRectGrowStartSec[i];
        const t1 = Math.max(t0, p.fftRectGateEndSec[i]);
        const grownSec = Number.isFinite(tPlay) ? p.constrain(tPlay, t0, t1) - t0 : 0;
        const rate = fftRectHalfSideGrowPxPerFrame(p) * (p.fftRectGrowHalfSideRate[i] ?? 1);
        hs = p.max(grownSec * 60 * rate, 0.2);
      }
      drawFftRectOutline(p, src, wlen, rx, ry, hs, p.fftRectColors[i]);
    }
  };

  p.mouseClicked = () => {
    p.togglePlayback();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

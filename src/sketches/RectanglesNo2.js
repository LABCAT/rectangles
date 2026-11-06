import p5 from 'p5';
import '@lib/p5.audioReact.js';
import '../lib/p5.fps.js';
import initCapture from '@labcat2020/p5.audioreactive-capture';
import { drawRectTubeFrame } from './functions/drawRectTubeFrame.js';
import { paintNo2Background } from './functions/no2BackgroundGradientCss.js';
import { readReelParams, applyPart, resolvePart, randomSeed } from '../lib/reelParams.js';
import { createNo2Look, melodyHue, pitchClassHue, hsbToRgb, TRACK_BPM, NO2_PARTS } from '../lib/no2Look.js';

/**
 * #RectanglesNo2 — a neon tube tunnel in five movements (115 bpm, 2.087s bars):
 *   bars  1–4   intro     drum frames fly the corner lanes, background flickers in
 *   bars  5–12  build     melody slams; Filter 3 opens them up (part a)
 *   bars 13–16  drop      the hero lead lights a neon solid dead centre (part b)
 *   bars 17–24  peak      Synth 1 spins a torus of frames round the hero, Fifth
 *                         Drops starts its corridor (part c)
 *   bars 25–33  breakdown drums leave; the corridor carries the motion, hero and
 *                         background fade to black after the last note (part d)
 *
 * Every frame is a pure function of song time + seed: all MIDI is read up front
 * and each element is drawn from "time since its note" (no per-frame decay
 * state), so headless capture is reproducible and can fast-forward without
 * drawing (`p.captureSeekable`).
 *
 * URL: ?seed ?bpm ?beats ?speed ?t ?auto ?part (see lib/reelParams.js).
 * Keys: N / P next / previous seed, R random seed, F FPS badge. Click: play/pause.
 */

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo2.mp3';
const midiUrl = base + 'audio/RectanglesNo2.mid';

// p5 2.x default camera distance (the perspective camera sits at z = 800).
const EYE_Z = 800;
// The old per-frame decays (k per frame at 60fps), as a function of elapsed time.
const decay = (k, dt) => Math.pow(k, Math.max(0, dt) * 60);

const clamp01 = (u) => Math.min(1, Math.max(0, u));
const ccUnit = (v) => clamp01(typeof v === 'number' && v > 1 ? v / 127 : (v ?? 0));

/** Index of the last event with `.t <= t` (events sorted by t), or -1. */
const lastAt = (events, t) => {
  let lo = 0;
  let hi = events.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
};

/** Events with t0 in [t - window, t], oldest first. */
const activeSince = (events, t, window) => {
  const out = [];
  for (let i = lastAt(events, t); i >= 0 && t - events[i].t <= window; i--) out.push(events[i]);
  return out.reverse();
};

const ccStep = (ccs, t) => {
  const i = lastAt(ccs, t);
  return i < 0 ? 0 : ccs[i].v;
};

const ccLerp = (ccs, t) => {
  if (!ccs.length) return 1;
  const i = lastAt(ccs, t);
  if (i < 0) return ccs[0].v;
  if (i >= ccs.length - 1) return ccs[i].v;
  const a = ccs[i];
  const b = ccs[i + 1];
  return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t || 1));
};

const notesOf = (track) =>
  (track?.notes ?? [])
    .map((n) => ({ t: n.time, midi: n.midi, vel: n.velocity ?? 0.8, dur: n.duration, ticks: n.ticks }))
    .sort((a, b) => a.t - b.t);

const ccsOf = (track, num) => {
  const all = Object.assign({}, track?.controlChanges);
  const list = all[num] ?? all[Object.keys(all)[0]] ?? [];
  return list.map((c) => ({ t: c.time, v: ccUnit(c.value) })).sort((a, b) => a.t - b.t);
};

// One hit per tick (same rule as scheduleCueSet) — chords count once.
const uniqueTicks = (notes) => notes.filter((n, i) => i === 0 || n.ticks !== notes[i - 1].ticks);

const sketch = (p) => {
  const reel = readReelParams(window.location.search);
  const motionBpm = reel.bpm ?? TRACK_BPM;
  const rate = reel.speed * (motionBpm / TRACK_BPM);
  const travelSec = (reel.beats * 60) / motionBpm;
  const beatSec = 60 / TRACK_BPM;
  const barSec = beatSec * 4;

  let seed = reel.seed;
  let look = createNo2Look(seed, { bpm: motionBpm, beats: reel.beats, speed: reel.speed });
  let ev = null;
  // The live part (prev/next in the control panel walk them; playing on flows
  // into the next, and after the last back to the first).
  // `?part=` also sets the capture range; parts picked live don't.
  const PART_IDS = Object.keys(NO2_PARTS);
  /** Next after the last part: the series' next sketch. */
  const NEXT_SKETCH_URL = `${base}number-3/?part=a`;
  let partId = NO2_PARTS[reel.part] ? reel.part : PART_IDS[0];
  let partRange = null;
  let partStarted = false;
  let bgIdx = -2;

  p.loopAudio = true;
  p.captureSeekable = true;
  p.fft = null;
  // Background gradients live in the WebGL canvas (a quarter-res texture), so
  // the canvas is the whole frame: capture needs no DOM compositing and can
  // use the fast data-URL path.
  let bgG = null; // p5.Graphics: the composed background texture
  let bgGrad = null; // offscreen canvas: the current gradient, repainted per hit

  const syncUrl = () => {
    const q = new URLSearchParams(window.location.search);
    if (partId) q.set('part', partId);
    else q.delete('part');
    q.set('seed', seed);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  };

  const setSeed = (next) => {
    seed = String(next);
    look = createNo2Look(seed, { bpm: motionBpm, beats: reel.beats, speed: reel.speed });
    bgIdx = -2;
    syncUrl();
    console.log(
      `[RectanglesNo2] seed ${seed} · ${look.lanes} lanes · ${look.frame} · hero ${look.hero} · ring ${look.ringFrames} · ${look.bg} · ${look.harmony} ${Math.round(look.hue)}°`,
    );
  };

  const stepSeed = (d) => {
    const n = Number(seed);
    setSeed(Number.isInteger(n) ? Math.max(0, n + d) : randomSeed());
  };

  // Live parts. Tone's Player calls p5.sound's onended (its onstop) for EVERY
  // source that ends — a seek stops the old source, so the lib would take it
  // as the song ending and restart from 0 (and each restart's stop() fires it
  // again, forever). The stale event can land >1s late on a busy machine, so
  // a timer can't fence it: each seek stops exactly one source, so count them
  // and swallow that many onstops. Before the first play there is no source;
  // it just starts at the part's offset.
  let staleStops = 0;

  const guardStaleStops = () => {
    const sf = p.song?.soundfile;
    if (!sf || sf._no2Guarded) return;
    sf._no2Guarded = true;
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

  // Move audio and clock to `sec`, playing or paused. Frames are drawn from
  // song time alone, so there is no cue state to rebuild.
  const jumpTo = (sec) => {
    const sf = p.song?.soundfile;
    if (!sf) return;
    if (sf.state === 'started' && p.song.isPlaying()) {
      const sources = sf._activeSources?.size ?? 1;
      try {
        sf.seek(sec);
        staleStops += sources;
      } catch (e) {
        console.warn('[RectanglesNo2] seek failed', e);
      }
    } else if (sf.state === 'started') {
      // Paused (p5.sound pauses at rate 0): a seek would start a zero-rate
      // source that Tone ends at once. Stop cleanly; the next play starts
      // fresh at `sec`.
      staleStops += sf._activeSources?.size ?? 1;
      sf.stop();
      p.song.paused = false;
      p.song.playing = false;
      startNextPlayAt(sec);
    } else {
      startNextPlayAt(sec);
      partStarted = true;
    }
    if (p.song.isPlaying()) {
      p._playbackSongSecondsAtWallStart = sec;
      p._playbackWallStartPerf = performance.now();
      p._reindexMidiCues?.(sec);
    } else {
      p._playbackFrozenSec = sec;
    }
  };

  const emitTrack = () => {
    const title = partId ? `Part ${partId.toUpperCase()} · ${NO2_PARTS[partId].title}` : '';
    window.dispatchEvent(new CustomEvent('labcat:track', { detail: { title } }));
  };

  // Follow the music into part `id` without moving the playhead.
  const flowInto = (id) => {
    partId = id;
    partRange = resolvePart(NO2_PARTS, id, { bpm: TRACK_BPM });
    syncUrl();
    emitTrack();
  };

  // Jump to the start of part `id`.
  const setPart = (id) => {
    flowInto(id);
    if (partRange) jumpTo(partRange.start);
  };

  // Prev on the first part restarts it; next on the last goes to RectanglesNo3.
  const stepPart = (d) => {
    const n = PART_IDS.indexOf(partId) + d;
    if (n >= PART_IDS.length) {
      window.location.assign(NEXT_SKETCH_URL);
      return;
    }
    setPart(PART_IDS[Math.max(0, n)]);
  };

  const timeNow = () => {
    if (!p.captureInProgress && reel.t !== null) return reel.t;
    const t = p.getSongPlaybackTime();
    return Number.isFinite(t) ? t : 0;
  };

  const rgb = (c, k = 1) => p.color(c[0] * k, c[1] * k, c[2] * k);

  const BG_SCALE = 4;

  const applyBackground = (idx) => {
    const w = Math.max(2, Math.ceil(p.width / BG_SCALE));
    const h = Math.max(2, Math.ceil(p.height / BG_SCALE));
    if (!bgG || bgG.width !== w || bgG.height !== h) {
      bgG?.remove?.();
      bgG = p.createGraphics(w, h);
      bgG.pixelDensity(1);
      bgGrad = document.createElement('canvas');
      bgGrad.width = w;
      bgGrad.height = h;
      bgIdx = -2;
    }
    if (idx === bgIdx) return;
    bgIdx = idx;
    paintNo2Background(bgGrad.getContext('2d'), w, h, look, idx);
  };

  // One full-screen pass a frame (fill is the cost on software GL): darken
  // the cached gradient into the small texture, then draw it once.
  const composeBackground = (opacity) => {
    const ctx = bgG.drawingContext;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(bgGrad, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${opacity})`;
    ctx.fillRect(0, 0, bgGrad.width, bgGrad.height);
    ctx.restore();
  };

  p.setup = async () => {
    p.pixelDensity(1);
    // FPS badge — always on, in the control panel (open it to see it); window.toggleFps() / press F hides it
    p.enableFpsIndicator();
    window.toggleFps = (opts) => p.toggleFpsIndicator(opts);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') p.toggleFpsIndicator();
      else if (k === 'n') stepSeed(1);
      else if (k === 'p') stepSeed(-1);
      else if (k === 'r') setSeed(randomSeed());
    });

    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
    p.canvas.style.position = 'relative';
    p.canvas.style.zIndex = '2';

    // The canvas holds the whole frame (background included), so capture
    // reads it directly — no CSS layers to composite.
    initCapture(p, { prefix: 'RectanglesNo2', enabled: false });

    setSeed(seed);

    await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = TRACK_BPM;
      const tr = data.tracks;
      const drums = notesOf(tr[10]); // Kong – True Identity
      const melody = notesOf(tr[8]); // Education Sequence copy
      const hero = notesOf(tr[7]); // Education Sequence (octave-up lead)
      const lastHero = hero[hero.length - 1];
      const synth = uniqueTicks(notesOf(tr[3])); // Synth 1
      const lastSynth = synth[synth.length - 1];
      ev = {
        flyers: drums.filter((n) => n.midi === 36 || n.midi === 37),
        bgHits: uniqueTicks(notesOf(tr[12])), // Kong – True Identity Copy
        fade13: ccsOf(tr[13], 74), // its filter: how far the background opens
        melodyCC: ccsOf(tr[9], 74), // Filter 3: melody weight + brightness
        melody: melody.map((n) => ({ ...n, dur: Math.max(0.25, n.dur) })),
        hero: hero.map((n) => ({ ...n, dur: Math.max(0.25, n.dur) })),
        drops: notesOf(tr[6]), // Fifth Drops Poly
        synth,
        heroEnd: lastHero ? lastHero.t + Math.max(0.25, lastHero.dur) : Infinity,
        synthEnd: lastSynth ? lastSynth.t + lastSynth.dur : -Infinity,
      };
    });

    p.fft = new p5.FFT();
    if (p.song) {
      p.song.disconnect();
      p.song.connect(p.fft);
      p.fft.gain.toDestination();
    }

    // ?part= → p.captureRange (capture renders just that part).
    applyPart(p, NO2_PARTS, reel.part, { bpm: TRACK_BPM });
    // Live: start on the part (?part= or the first) and loop it.
    partRange = resolvePart(NO2_PARTS, partId, { bpm: TRACK_BPM });
    if (partRange) p._playbackFrozenSec = partRange.start;
    guardStaleStops();
    emitTrack();
    window.addEventListener('labcat:track-prev', () => stepPart(-1));
    window.addEventListener('labcat:track-next', () => stepPart(1));

    // The first play starts the audio (and the clock, via the frozen time)
    // on the part. The play button calls togglePlayback directly.
    const baseToggle = p.togglePlayback;
    p.togglePlayback = function () {
      const first = partRange && !partStarted && !this.captureEnabled && this.audioLoaded && !this.song?.isPlaying();
      if (first) {
        partStarted = true;
        this._playbackFrozenSec = partRange.start;
        startNextPlayAt(partRange.start);
      }
      baseToggle.call(this);
    };
  };

  // --- Layers --------------------------------------------------------------

  const drawBackground = (t) => {
    const i = lastAt(ev.bgHits, t);
    applyBackground(i);
    let opacity = 1;
    if (i >= 0) {
      // Each hit slams the black sheet back on, then it opens over the note,
      // never further than the filter allows.
      const hit = ev.bgHits[i];
      const fadeMax = ccStep(ev.fade13, t) * 0.5;
      opacity = 1 - Math.min(clamp01((t - hit.t) / Math.max(hit.dur, 1e-3)), fadeMax);
    }
    // Outro: back to black over the bar after the last hero note.
    opacity = Math.max(opacity, clamp01((t - ev.heroEnd) / barSec));
    // Gradient quad + black sheet, unlit (lights come after), then clear the
    // depth so the tunnel draws over it.
    if (opacity >= 0.999) {
      p.background(0);
      return;
    }
    composeBackground(opacity);
    p.push();
    p.noStroke();
    p.imageMode(p.CORNER);
    p.image(bgG, -p.width / 2, -p.height / 2, p.width, p.height);
    p.pop();
    p.clearDepth();
  };

  const drawFlyers = (t, s, zStart, zDeep) => {
    const marginX = p.width * 0.12;
    const marginY = p.height * 0.14;
    // Oldest first = deepest first.
    for (const f of activeSince(ev.flyers, t, travelSec)) {
      const prog = (t - f.t) / travelSec;
      const z = p.lerp(zStart, zDeep, prog);
      const m = (EYE_Z - z) / EYE_Z;
      const kick = f.midi === 36;
      const frameW = s * (kick ? 0.08 : 0.064);
      const frameH = frameW / look.frameAspect;
      const tubeR = s * 0.0028 * look.tube;
      const dir = kick ? -1 : 1;
      // Screen-space lanes, converted per depth so they hold their line near the lens.
      const x0 = dir * (p.width / 2 - marginX);
      let y0 = p.height / 2 - marginY;
      if (look.lanes === 'mirror') y0 *= kick ? 1 : -1;
      else if (look.lanes === 'rails') y0 = 0;
      const sx = p.lerp(x0, dir * s * 0.02, prog);
      const sy = p.lerp(y0, 0, prog);
      p.push();
      p.translate(sx * m, sy * m, z);
      drawRectTubeFrame(p, frameW, frameH, tubeR, rgb(kick ? look.kick : look.snare));
      p.pop();
    }
  };

  // Melody (track 8): flat neon outlines slammed at the lens, expanding off
  // screen over the note; Filter 3 drives weight + brightness.
  const drawMelody = (t, s) => {
    const filter = ev.melodyCC.length ? ccLerp(ev.melodyCC, t) : 1;
    const li = lastAt(ev.melody, t);
    if (li >= 0) {
      const edge = decay(0.85, t - ev.melody[li].t);
      if (edge > 0.02) {
        const eb = edge * (0.3 + 0.7 * filter);
        p.push();
        p.noFill();
        p.stroke(255 * eb, 255 * eb, 255 * eb, 255 * eb);
        p.strokeWeight(Math.max(2, s * 0.012 * eb));
        p.rect(-p.width / 2 + 6, -p.height / 2 + 6, p.width - 12, p.height - 12);
        p.pop();
      }
    }
    if (filter <= 0.02) return;
    const slams = activeSince(ev.melody, t, 4)
      .filter((g) => t - g.t <= g.dur)
      .slice(-8);
    for (const g of slams) {
      const prog = (t - g.t) / g.dur;
      const c = hsbToRgb(melodyHue(look, g.midi), 90, 95);
      for (let L = 0; L < look.slamLayers; L++) {
        const lp = clamp01(prog - L * 0.12);
        const ease = 1 - Math.pow(1 - lp, 3);
        const grow = 0.66 + ease * 0.55 + L * 0.06;
        const a = Math.pow(1 - lp, 1.5) * (0.25 + 0.75 * filter) * (L ? 0.5 / L : 1);
        p.push();
        p.noFill();
        p.stroke(c[0], c[1], c[2], 255 * a);
        p.strokeWeight((2 + 10 * filter + 8 * g.vel) * (1 - lp * 0.5));
        p.rect((-p.width * grow) / 2, (-p.height * grow) / 2, p.width * grow, p.height * grow);
        p.pop();
      }
    }
  };

  // Fifth Drops (track 6): centred frames that fall from the lens into the
  // tunnel, coloured by pitch class like the hero (same tune, an octave down).
  const drawCorridor = (t, s, zDeep) => {
    const dropTravel = beatSec * 8;
    const active = activeSince(ev.drops, t, dropTravel);
    if (!active.length) return;
    p.blendMode(p.ADD);
    for (const d of active) {
      const prog = (t - d.t) / dropTravel;
      const c = hsbToRgb(pitchClassHue(look, d.midi), 85, 95);
      for (let k = 0; k < look.drops; k++) {
        const kp = clamp01(prog - k * 0.06);
        const z = p.lerp(EYE_Z * 0.4, zDeep, 1 - Math.pow(1 - kp, 2));
        const dim = Math.pow(1 - kp, 1.2) * (0.35 + 0.65 * d.vel) * (k ? 0.6 : 1);
        const sc = Math.pow(0.8, k);
        p.push();
        p.translate(0, 0, z);
        p.rotateZ(kp * 0.25 * look.spin);
        drawRectTubeFrame(p, p.width * 0.86 * sc, p.height * 0.86 * sc, s * 0.003 * look.tube, rgb(c, dim));
        p.pop();
      }
    }
    p.blendMode(p.BLEND);
  };

  // Synth 1 (track 3): a torus built from rectangular cross-sections, orbiting
  // the hero. Each stab ratchets the ring one slot and lights the frame it
  // lands on; long notes swell the ring.
  const drawRing = (t, s, zHero) => {
    if (!ev.synth.length || t < ev.synth[0].t) return;
    const release = beatSec * 2;
    if (t > ev.synthEnd + release) return;
    const presence = clamp01((t - ev.synth[0].t) / beatSec) * (1 - clamp01((t - ev.synthEnd) / release));
    const i = lastAt(ev.synth, t);
    const n = ev.synth[i];
    const since = t - n.t;
    const N = look.ringFrames;
    const step = (Math.PI * 2) / N;
    const ratchet = (i + (1 - Math.pow(1 - clamp01(since / 0.12), 3))) * step;
    const long = n.dur >= beatSec;
    const swell = long ? Math.sin(Math.PI * clamp01(since / n.dur)) : 0;
    const flash = long ? 0.4 * swell : decay(0.88, since);
    const R = s * 0.48 * (1 + 0.18 * swell);
    const fw = s * 0.1;
    const fh = fw / look.frameAspect;
    const lit = i % N;
    const tubeR = s * 0.0022 * look.tube;
    p.blendMode(p.ADD);
    p.push();
    p.translate(0, 0, zHero);
    p.rotateX(look.ringTilt + 0.15 * Math.sin(t * rate * 0.5));
    p.rotateZ(look.spin * (t * rate * 0.3 + ratchet));
    for (let k = 0; k < N; k++) {
      const a = k * step;
      const hot = k === lit ? flash : 0;
      const k2 = (0.32 + 0.68 * hot) * presence;
      const c = hsbToRgb(look.hue2 + hot * 40, 80 - 50 * hot, 100);
      p.push();
      p.translate(R * Math.cos(a), R * Math.sin(a), 0);
      p.rotateZ(a);
      p.rotateX(p.HALF_PI);
      drawRectTubeFrame(p, fw * (1 + 0.3 * hot), fh * (1 + 0.3 * hot), tubeR, rgb(c, k2));
      p.pop();
    }
    p.pop();
    p.blendMode(p.BLEND);
  };

  const drawHeroForm = (fs, tube, col, rt, spin) => {
    const ho = fs / 2;
    p.push();
    p.rotateX(rt * 0.4 + spin * 0.3);
    p.rotateY(rt * 0.55 + spin * 0.5);
    if (look.hero === 'cube') {
      for (const z of [-ho, ho]) {
        p.push();
        p.translate(0, 0, z);
        drawRectTubeFrame(p, fs, fs, tube, col);
        p.pop();
      }
      for (const x of [-ho, ho]) {
        p.push();
        p.translate(x, 0, 0);
        p.rotateY(p.HALF_PI);
        drawRectTubeFrame(p, fs, fs, tube, col);
        p.pop();
      }
      for (const y of [-ho, ho]) {
        p.push();
        p.translate(0, y, 0);
        p.rotateX(p.HALF_PI);
        drawRectTubeFrame(p, fs, fs, tube, col);
        p.pop();
      }
    } else if (look.hero === 'gyro') {
      drawRectTubeFrame(p, fs, fs / look.frameAspect, tube, col);
      p.push();
      p.rotateY(p.HALF_PI);
      drawRectTubeFrame(p, fs, fs / look.frameAspect, tube, col);
      p.pop();
      p.push();
      p.rotateX(p.HALF_PI);
      drawRectTubeFrame(p, fs, fs, tube, col);
      p.pop();
    } else {
      for (let k = 0; k < 3; k++) {
        const sc = Math.pow(0.72, k);
        p.push();
        p.rotateZ((k + 1) * (rt * 0.35 + spin * 0.2) * (k % 2 ? -1 : 1));
        drawRectTubeFrame(p, fs * 1.2 * sc, fs * 1.2 * sc, tube, col);
        p.pop();
      }
    }
    p.pop();
  };

  /** Hero light state at t: flare, accumulated spin, colour (all from time since notes). */
  const heroState = (t) => {
    const i = lastAt(ev.hero, t);
    if (i < 0) return null;
    const last = ev.hero[i];
    const punch = decay(0.9, t - last.t);
    let spin = 0;
    for (let k = i; k >= 0 && k > i - 12; k--) {
      const n = ev.hero[k];
      spin += 2.5 * (0.5 + n.vel) * decay(0.96, t - n.t);
    }
    return {
      last,
      punch,
      hg: Math.min(1, punch * 1.6),
      spin,
      col: hsbToRgb(pitchClassHue(look, last.midi), 90, 95),
    };
  };

  // Hero lead (track 7): the only solid, dead centre, from its entrance on.
  // Breathes with the live waveform.
  const drawHero = (t, s, zHero, hero, wave) => {
    const { hg, spin, punch, col: hcc, last: hn } = hero;
    const fade = 1 - clamp01((t - ev.heroEnd) / barSec);
    if (fade <= 0) return;
    const rt = t * rate;
    let heroE = 0;
    if (wave?.length) {
      for (let i = 0; i < wave.length; i += 8) heroE += Math.abs(wave[i] ?? 0);
      heroE /= wave.length / 8;
    }
    const hprog = clamp01((t - hn.t) / hn.dur);
    const hsz = s * 0.13 * (1 + punch * 0.7) * (1 + heroE * 1.5) * (0.8 + 0.2 * (1 - hprog)) * fade;
    const heroTube = s * 0.0022 * look.tube;
    const whiteHot = p.lerpColor(p.color(255, 255, 255), rgb(hcc), 0.3);
    const passes = [
      { sc: 1.3, tube: heroTube * 3.5, col: rgb(hcc, 0.35) },
      { sc: 1.12, tube: heroTube * 2.2, col: rgb(hcc) },
      { sc: 1.0, tube: heroTube, col: whiteHot },
    ];
    // Neon: stacked additive passes (wide dim outer, colour mid, white-hot core).
    p.blendMode(p.ADD);
    for (const gp of passes) {
      p.push();
      p.translate(0, 0, zHero);
      drawHeroForm(hsz * gp.sc, gp.tube, gp.col, rt * look.spin, spin);
      p.pop();
    }
    // Halo: additive shells — black adds nothing, so brightness = colour
    const halo = hsz * 1.8;
    const haloCol = rgb(hcc, 0.45);
    p.push();
    p.translate(0, 0, zHero);
    p.rotateY(-(rt * 0.3 + spin * 0.4));
    drawRectTubeFrame(p, halo, halo, s * 0.001, haloCol);
    p.pop();
    p.push();
    p.translate(0, 0, zHero);
    p.rotateY(p.HALF_PI);
    p.rotateX(rt * 0.25 + spin * 0.3);
    drawRectTubeFrame(p, halo, halo, s * 0.001, haloCol);
    p.pop();
    p.push();
    p.translate(0, 0, zHero);
    p.rotateX(p.HALF_PI);
    p.rotateZ(-rt * 0.35);
    drawRectTubeFrame(p, halo, halo, s * 0.001, haloCol);
    p.pop();
    // Expanding shells off recent hero hits — bloom outward and die
    for (const n of activeSince(ev.hero, t, 8).slice(-3)) {
      const np = (t - n.t) / n.dur;
      if (np < 0 || np > 1) continue;
      const sh = hsz * (1.4 + np * 2.2);
      const dim = Math.pow(1 - np, 2) * (0.3 + 0.7 * hg);
      p.push();
      p.translate(0, 0, zHero);
      p.rotateZ(np * Math.PI);
      drawRectTubeFrame(p, sh, sh, s * 0.001, rgb(hcc, dim));
      p.pop();
    }
    p.blendMode(p.BLEND);
    for (let o = 0; o < 2; o++) {
      p.push();
      p.translate(0, 0, zHero);
      if (o === 0) {
        p.rotateX(Math.PI / 3);
        p.rotateZ(rt * (0.8 + hg * 3) + Math.PI);
      } else {
        p.rotateY(Math.PI / 3);
        p.rotateZ(-rt * (0.6 + hg * 2.5));
      }
      drawRectTubeFrame(p, hsz * 3.2, hsz * 2.3, s * 0.0012, rgb(hcc, fade));
      p.pop();
    }
  };

  let lastCaptureT = NaN;

  p.draw = () => {
    const t = timeNow();
    // Capture calls draw() directly per frame while p5's own loop keeps
    // running; both would draw the same time. Draw each capture time once —
    // the canvas keeps it (preserveDrawingBuffer) for the screenshot.
    if (p.captureInProgress) {
      if (t === lastCaptureT) return;
      lastCaptureT = t;
    } else lastCaptureT = NaN;
    // Self-contained frame: the direct call skips p5's per-frame reset, so do
    // it here (matrix + lights) and both paths render identically.
    p.resetMatrix();
    p.noLights();
    p.blendMode(p.BLEND);
    p.clear();
    if (!ev) return;

    // Live: play on into the next part (parts sit back to back, so the audio
    // just carries on); after the last, on to RectanglesNo3.
    if (partRange && !p.captureInProgress && p.song?.isPlaying() && t >= partRange.end) {
      const i = PART_IDS.indexOf(partId);
      if (i < PART_IDS.length - 1) flowInto(PART_IDS[i + 1]);
      else window.location.assign(NEXT_SKETCH_URL);
    }

    drawBackground(t);

    const hero = heroState(t);
    // Hero lead owns the lights: each note flares the whole scene toward its hue
    const hg = hero?.hg ?? 0;
    const hc0 = hero?.col ?? [255, 252, 245];
    p.ambientLight(60 + 200 * hg, 60 + 200 * hg, 70 + 200 * hg);
    p.directionalLight(
      255 + (hc0[0] - 255) * hg,
      252 + (hc0[1] - 252) * hg,
      245 + (hc0[2] - 245) * hg,
      0.4,
      -0.6,
      -0.7,
    );

    const s = Math.min(p.width, p.height);
    const zDeep = -s * 5.5;
    const zStart = Math.min(s * 0.95, EYE_Z * 0.75);
    const zHero = p.lerp(s * 0.95, zDeep, 0.15);
    const wave = p.fft?.waveform?.() ?? null;

    p.push();
    p.rotateZ(look.roll);
    drawFlyers(t, s, zStart, zDeep);
    p.pop();

    drawMelody(t, s);

    p.push();
    p.rotateZ(look.roll);
    drawCorridor(t, s, zDeep);
    drawRing(t, s, zHero);
    if (hero) drawHero(t, s, zHero, hero, wave);
    p.pop();
  };

  p.mouseClicked = () => {
    p.togglePlayback();
  };

  // Called by the audio engine on loop/restart. Every frame is drawn from song
  // time, so there is no per-pass state to clear — only the background cache,
  // and the look rolls over when ?auto is on.
  p.resetAnimation = () => {
    bgIdx = -2;
    if (reel.auto && !p.captureInProgress) stepSeed(1);
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

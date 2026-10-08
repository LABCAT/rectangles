import p5 from 'p5';
import '@lib/p5.audioReact.js';
import '../lib/p5.fps.js';
import { drawRectTubeFrame } from '@sketches/functions/drawRectTubeFrame.js';
import { getNo2BackgroundGradientCss } from '@sketches/functions/no2BackgroundGradientCss.js';

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo2.mp3';
const midiUrl = base + 'audio/RectanglesNo2.mid';

const BEATS_PER_BAR = 4;
const BARS_PER_LOOP = 4;
const BEATS_PER_LOOP = BEATS_PER_BAR * BARS_PER_LOOP;

const loopDurationSec = (p) => (BEATS_PER_LOOP * 60) / (p.midiBpm || 115);

const applyNo2BgGradient = (p) => {
  if (!p.bgGradientEl) return;
  const { background, backgroundBlendMode } = getNo2BackgroundGradientCss(p);
  p.bgGradientEl.style.background = background;
  p.bgGradientEl.style.backgroundBlendMode = backgroundBlendMode;
};

const sketch = (p) => {
  p.loopAudio = true;
  p.track10Flyers = [];
  p.track13FadeMax = 0;
  p.melodySlams = [];
  p.melodyFilterCC = null;
  p.melodyFilter = 0;
  p.melodyEdge = 0;
  p.heroNotes = [];
  p.heroPunch = 0;
  p.heroSpin = 0;
  p.heroCol = null;
  p.fft = null;
  p.bgGradientEl = null;
  p.bgBlackoutEl = null;
  p.bgReveal = { startSec: 0, durationSec: 0 };

  p.setup = async () => {
    p.pixelDensity(1);
    // FPS badge — bottom-left; on by default, ?fps=0 to hide, window.toggleFps() / press F
    const params = new URLSearchParams(window.location.search);
    const wantsFps = !params.has('fps') || params.get('fps') !== '0';
    if (wantsFps) p.enableFpsIndicator({ position: 'bottom-left' });
    window.toggleFps = (opts) => p.toggleFpsIndicator({ position: 'bottom-left', ...opts });
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) {
        p.toggleFpsIndicator({ position: 'bottom-left' });
      }
    });

    const bgWrap = document.createElement('div');
    bgWrap.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
    p.bgGradientEl = document.createElement('div');
    p.bgGradientEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000;';
    p.bgBlackoutEl = document.createElement('div');
    p.bgBlackoutEl.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;background:#000;opacity:1;';
    bgWrap.appendChild(p.bgGradientEl);
    bgWrap.appendChild(p.bgBlackoutEl);
    document.body.insertBefore(bgWrap, document.body.firstChild);

    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
    p.canvas.style.position = 'relative';
    p.canvas.style.zIndex = '2';

    await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = 115;
      // Kong – True Identity 
      p.scheduleCueSet(data.tracks[10]?.notes ?? [], 'onTrack10Cue');
      // Kong – True Identity Copy
      p.scheduleCueSet(data.tracks[12]?.notes ?? [], 'onTrack12Cue');
      // Kong – True Identity Copy Filter
      const controlChanges = Object.assign({}, data.tracks[13]?.controlChanges);
      const filterCcCues = controlChanges[Object.keys(controlChanges)[0]] ?? [];
      p.scheduleCueSet(filterCcCues, 'onTrack13Cue');
      // Education Sequence copy (melody) + Filter 3 (its filter sweep)
      p.scheduleCueSet(data.tracks[8]?.notes ?? [], 'onTrack8Cue');
      const melodyCC = Object.assign({}, data.tracks[9]?.controlChanges);
      p.melodyFilterCC = melodyCC[Object.keys(melodyCC)[0]] ?? null;
      // Education Sequence (hero lead, octave-up melody)
      p.scheduleCueSet(data.tracks[7]?.notes ?? [], 'onTrack7Cue');
    });

    p.fft = new p5.FFT();
    if (p.song) {
      p.song.disconnect();
      p.song.connect(p.fft);
      p.fft.gain.toDestination();
    }
  };

  p.draw = () => {
    p.clear();

    const songTime = p.getSongPlaybackTime();
    const { startSec: fadeStart, durationSec: fadeDur } = p.bgReveal;
    const el = p.bgBlackoutEl;
    if (el && Number.isFinite(songTime) && fadeDur > 0) {
      const throughFade = p.constrain(
        (songTime - fadeStart) / fadeDur,
        0,
        p.track13FadeMax
      );
      el.style.opacity = String(1 - throughFade);
    }

    // Hero lead owns the lights: each note flares the whole scene toward its hue
    if (p.heroPunch > 0) p.heroPunch *= 0.9;
    if (p.heroSpin > 0.01) p.heroSpin *= 0.96;
    // Hero lead owns the lights: each note flares the whole scene toward its hue
    const hg = Math.min(1, p.heroPunch * 1.6);
    const hc0 = p.heroCol ?? [255, 252, 245];
    p.ambientLight(60 + 200 * hg, 60 + 200 * hg, 70 + 200 * hg);
    p.directionalLight(
      255 + (hc0[0] - 255) * hg,
      252 + (hc0[1] - 252) * hg,
      245 + (hc0[2] - 245) * hg,
      0.4,
      -0.6,
      -0.7
    );

    const s = p.min(p.width, p.height);
    const dur = loopDurationSec(p);
    const zDeep = -s * 5.5;
    const zClose = s * 0.95;

    let wave = null;
    let wlen = 0;
    if (p.fft) {
      p.fft.analyze();
      const w = p.fft.waveform();
      if (w?.length) {
        wave = w;
        wlen = w.length;
      }
    }

    if (Number.isFinite(songTime) && dur > 0) {
      // Drums travel deep like before, but along bottom-corner lanes.
      // Perspective compensation: near the camera magnification explodes,
      // so lane positions are defined in screen space and converted per depth.
      const eyeZ = p.height / 2 / Math.tan(Math.PI / 6);
      const zStart = Math.min(zClose, eyeZ * 0.75);
      const marginX = p.width * 0.12;
      const marginY = p.height * 0.14;
      const byDepth = [...p.track10Flyers].sort(
        (a, b) => (songTime - b.t0) / dur - (songTime - a.t0) / dur
      );

      for (const f of byDepth) {
        const prog = (songTime - f.t0) / dur;
        if (prog < 0 || prog > 1) continue;

        const z = p.lerp(zStart, zDeep, prog);
        const m = (eyeZ - z) / eyeZ;
        const kick = f.kind === 'kick';
        const frameW = s * (kick ? 0.08 : 0.064);
        const frameH = s * (kick ? 0.056 : 0.044);
        const tubeR = s * 0.0028;
        const col = kick ? p.color(85, 195, 255) : p.color(255, 138, 72);
        // Rooted in the bottom corners, converging to the original center
        // lanes as they fly deep — diagonal flight down the tunnel.
        const dir = kick ? -1 : 1;
        const sx = p.lerp(dir * (p.width / 2 - marginX), dir * s * 0.02, prog);
        const sy = p.lerp(p.height / 2 - marginY, 0, prog);
        const cx = sx * m;
        const cy = sy * m;

        p.push();
        p.translate(cx, cy, z);
        drawRectTubeFrame(p, frameW, frameH, tubeR, col);
        p.pop();
      }

      p.track10Flyers = p.track10Flyers.filter((f) => songTime - f.t0 <= dur);

      // --- Melody slams: flat screen-space frames (WEBGL origin = center).
      // Opposite language to the drums (3D shaded tubes flying inward):
      // each melody stab slams a neon outline at the lens that expands
      // outward off-screen and dies over the note duration. Track 9 filter
      // drives weight + brightness.
      const mcc = p.melodyFilterCC;
      if (mcc?.length) {
        let f = mcc[mcc.length - 1].value;
        if (songTime <= mcc[0].time) f = mcc[0].value;
        else {
          for (let i = 1; i < mcc.length; i++) {
            if (songTime <= mcc[i].time) {
              const a = mcc[i - 1];
              const b = mcc[i];
              const span = b.time - a.time || 1;
              f = a.value + (b.value - a.value) * ((songTime - a.time) / span);
              break;
            }
          }
        }
        p.melodyFilter = p.constrain(typeof f === 'number' && f > 1 ? f / 127 : (f ?? 0), 0, 1);
      } else p.melodyFilter = 1;

      if (p.melodyEdge > 0) p.melodyEdge *= 0.85;
      if (p.melodyEdge > 0.02) {
        const eb = Math.min(1, p.melodyEdge) * (0.3 + 0.7 * p.melodyFilter);
        p.push();
        p.noFill();
        p.stroke(255 * eb, 255 * eb, 255 * eb, 255 * eb);
        p.strokeWeight(Math.max(2, s * 0.012 * eb));
        p.rect(-p.width / 2 + 6, -p.height / 2 + 6, p.width - 12, p.height - 12);
        p.pop();
      }

      if (p.melodyFilter > 0.02) {
        for (const g of p.melodySlams) {
          const prog = (songTime - g.t0) / g.dur;
          if (prog < 0 || prog > 1) continue;
          p.push();
          p.colorMode(p.HSB, 360, 100, 100, 1);
          const hue = p.map(g.midi, 36, 72, 190, 550, true) % 360;
          const col = p.color(hue, 90, 95);
          p.pop();
          for (let L = 0; L < 2; L++) {
            const lp = p.constrain(prog - L * 0.12, 0, 1);
            const ease = 1 - Math.pow(1 - lp, 3);
            const w = p.width * (0.66 + ease * 0.55 + L * 0.06);
            const h = p.height * (0.66 + ease * 0.55 + L * 0.06);
            const a = Math.pow(1 - lp, 1.5) * (0.25 + 0.75 * p.melodyFilter) * (L ? 0.5 : 1);
            p.push();
            p.noFill();
            p.stroke(p.red(col), p.green(col), p.blue(col), 255 * a);
            p.strokeWeight((2 + 10 * p.melodyFilter + 8 * g.vel) * (1 - lp * 0.5));
            p.rect(-w / 2, -h / 2, w, h);
            p.pop();
          }
        }
        p.melodySlams = p.melodySlams.filter((g) => songTime - g.t0 <= g.dur);
      }

      // --- Hero lead (track 7): the only filled solid, dead center. Appears
      // with its entrance (~25s). Pitch CLASS picks the hue so it reads as the
      // same tune as track 8, one octave up. Breathes with the live FFT.
      if (p.heroNotes.length) {
        const zHero = p.lerp(zClose, zDeep, 0.15);
        let heroE = 0;
        if (wave && wlen > 0) {
          for (let i = 0; i < wlen; i += 8) heroE += Math.abs(wave[i] ?? 0);
          heroE /= wlen / 8;
        }
        const hn = p.heroNotes[p.heroNotes.length - 1];
        const hprog = p.constrain((songTime - hn.t0) / hn.dur, 0, 1);
        const hsz =
          s * 0.13 * (1 + p.heroPunch * 0.7) * (1 + heroE * 1.5) * (0.8 + 0.2 * (1 - hprog));
        const hcc = p.heroCol ?? [255, 200, 120];
        // Neon cube: 6 frames × 3 additive passes (wide dim outer, color
        // mid, white-hot core). Stacked ADD is what reads as neon glow.
        const heroTube = s * 0.0022;
        const whiteHot = p.lerpColor(
          p.color(255, 255, 255),
          p.color(hcc[0], hcc[1], hcc[2]),
          0.3
        );
        const heroFrameCol = p.color(hcc[0], hcc[1], hcc[2]);
        const outerCol = p.color(hcc[0] * 0.35, hcc[1] * 0.35, hcc[2] * 0.35);
        const passes = [
          { sc: 1.3, tube: heroTube * 3.5, col: outerCol },
          { sc: 1.12, tube: heroTube * 2.2, col: heroFrameCol },
          { sc: 1.0, tube: heroTube, col: whiteHot },
        ];
        p.blendMode(p.ADD);
        for (const gp of passes) {
          const fs = hsz * gp.sc;
          const ho = fs / 2;
          p.push();
          p.translate(0, 0, zHero);
          p.rotateX(songTime * 0.4 + p.heroSpin * 0.3);
          p.rotateY(songTime * 0.55 + p.heroSpin * 0.5);
          for (const z of [-ho, ho]) {
            p.push();
            p.translate(0, 0, z);
            drawRectTubeFrame(p, fs, fs, gp.tube, gp.col);
            p.pop();
          }
          for (const x of [-ho, ho]) {
            p.push();
            p.translate(x, 0, 0);
            p.rotateY(p.HALF_PI);
            drawRectTubeFrame(p, fs, fs, gp.tube, gp.col);
            p.pop();
          }
          for (const y of [-ho, ho]) {
            p.push();
            p.translate(0, y, 0);
            p.rotateX(p.HALF_PI);
            drawRectTubeFrame(p, fs, fs, gp.tube, gp.col);
            p.pop();
          }
          p.pop();
        }
        p.blendMode(p.BLEND);
        // Halo: additive shells — black adds nothing, so brightness = alpha
        const halo = hsz * 1.8;
        p.blendMode(p.ADD);
        const haloCol = p.color(hcc[0] * 0.45, hcc[1] * 0.45, hcc[2] * 0.45);
        p.push();
        p.translate(0, 0, zHero);
        p.rotateY(-(songTime * 0.3 + p.heroSpin * 0.4));
        drawRectTubeFrame(p, halo, halo, s * 0.001, haloCol);
        p.pop();
        p.push();
        p.translate(0, 0, zHero);
        p.rotateY(p.HALF_PI);
        p.rotateX(songTime * 0.25 + p.heroSpin * 0.3);
        drawRectTubeFrame(p, halo, halo, s * 0.001, haloCol);
        p.pop();
        p.push();
        p.translate(0, 0, zHero);
        p.rotateX(p.HALF_PI);
        p.rotateZ(-songTime * 0.35);
        drawRectTubeFrame(p, halo, halo, s * 0.001, haloCol);
        p.pop();
        // Expanding shells off recent hero hits — bloom outward and die
        for (const n of p.heroNotes.slice(-3)) {
          const np = (songTime - n.t0) / n.dur;
          if (np < 0 || np > 1) continue;
          const sh = hsz * (1.4 + np * 2.2);
          const dim = Math.pow(1 - np, 2) * (0.3 + 0.7 * hg);
          const scol = p.color(hcc[0] * dim, hcc[1] * dim, hcc[2] * dim);
          p.push();
          p.translate(0, 0, zHero);
          p.rotateZ(np * Math.PI);
          drawRectTubeFrame(p, sh, sh, s * 0.001, scol);
          p.pop();
        }
        p.blendMode(p.BLEND);
        for (let o = 0; o < 2; o++) {
          p.push();
          p.translate(0, 0, zHero);
          if (o === 0) {
            p.rotateX(Math.PI / 3);
            p.rotateZ(songTime * (0.8 + hg * 3) + Math.PI);
          } else {
            p.rotateY(Math.PI / 3);
            p.rotateZ(-songTime * (0.6 + hg * 2.5));
          }
          drawRectTubeFrame(p, hsz * 3.2, hsz * 2.3, s * 0.0012, p.color(hcc[0], hcc[1], hcc[2]));
          p.pop();
        }
      }
    }
  };

  p.onTrack10Cue = function (note) {
    const m = note.midi;
    if (m !== 36 && m !== 37) return;
    const t = this.getSongPlaybackTime();
    if (!Number.isFinite(t)) return;
    this.track10Flyers.push({
      t0: t,
      kind: m === 36 ? 'kick' : 'snare',
    });
  };

  p.onTrack8Cue = function (note) {
    const t = this.getSongPlaybackTime();
    if (!Number.isFinite(t)) return;
    const dur = Math.max(0.25, (note.durationTicks / this.midiPpq) * (60 / this.midiBpm));
    this.melodySlams.push({ t0: t, midi: note.midi, vel: note.velocity ?? 0.8, dur });
    if (this.melodySlams.length > 8) {
      this.melodySlams.splice(0, this.melodySlams.length - 8);
    }
    this.melodyEdge = 1;
  };

  p.onTrack7Cue = function (note) {
    const t = this.getSongPlaybackTime();
    if (!Number.isFinite(t)) return;
    const dur = Math.max(0.25, (note.durationTicks / this.midiPpq) * (60 / this.midiBpm));
    this.heroNotes.push({ t0: t, midi: note.midi, vel: note.velocity ?? 0.8, dur });
    if (this.heroNotes.length > 8) {
      this.heroNotes.splice(0, this.heroNotes.length - 8);
    }
    this.heroPunch = 1;
    this.heroSpin += 2.5 * (0.5 + (note.velocity ?? 0.8));
    // Pitch class, not pitch: same tune as track 8 reads as the same color
    this.push();
    this.colorMode(this.HSB, 360, 100, 100, 1);
    const c = this.color(((note.midi % 12) * 30) % 360, 90, 95);
    this.pop();
    this.heroCol = [this.red(c), this.green(c), this.blue(c)];
  };

  p.onTrack12Cue = function (note) {
    const durationSec = (note.durationTicks / this.midiPpq) * (60 / this.midiBpm);
    const t = this.getSongPlaybackTime();
    this.bgReveal = { startSec: t, durationSec };
    applyNo2BgGradient(this);
  };

  p.onTrack13Cue = function (cc) {
    const v = cc.value;
    const u = typeof v === 'number' && v > 1 ? v / 127 : (v ?? 0);
    this.track13FadeMax = Math.min(1, Math.max(0, u)) * 0.5;
  };

  p.mouseClicked = () => {
    p.togglePlayback();
  };

  // Called by the audio engine on loop/restart: drop all per-play state so
  // nothing (hero included) lingers visibly into the next pass.
  p.resetAnimation = () => {
    p.track10Flyers = [];
    p.melodySlams = [];
    p.melodyEdge = 0;
    p.melodyFilter = 0;
    p.heroNotes = [];
    p.heroPunch = 0;
    p.heroSpin = 0;
    p.heroCol = null;
    p.bgReveal = { startSec: 0, durationSec: 0 };
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

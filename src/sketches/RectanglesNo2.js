import p5 from 'p5';
import '@lib/p5.audioReact.js';
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
  p.track10Flyers = [];
  p.track13FadeMax = 0;
  p.bgGradientEl = null;
  p.bgBlackoutEl = null;
  p.bgReveal = { startSec: 0, durationSec: 0 };

  p.setup = async () => {
    p.pixelDensity(1);

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
    });
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

    p.ambientLight(60, 60, 70);
    p.directionalLight(255, 252, 245, 0.4, -0.6, -0.7);

    const s = p.min(p.width, p.height);
    const dur = loopDurationSec(p);
    const zDeep = -s * 5.5;
    const zClose = s * 0.95;

    if (Number.isFinite(songTime) && dur > 0) {
      const byDepth = [...p.track10Flyers].sort(
        (a, b) => (songTime - b.t0) / dur - (songTime - a.t0) / dur
      );

      for (const f of byDepth) {
        const prog = (songTime - f.t0) / dur;
        if (prog < 0 || prog > 1) continue;

        const z = p.lerp(zClose, zDeep, prog);
        const kick = f.kind === 'kick';
        const frameW = s * (kick ? 0.028 : 0.022);
        const frameH = s * (kick ? 0.02 : 0.015);
        const tubeR = s * 0.001;
        const col = kick ? p.color(85, 195, 255) : p.color(255, 138, 72);
        const xOff = kick ? -s * 0.07 : s * 0.07;

        p.push();
        p.translate(xOff, 0, z);
        drawRectTubeFrame(p, frameW, frameH, tubeR, col);
        p.pop();
      }

      p.track10Flyers = p.track10Flyers.filter((f) => songTime - f.t0 <= dur);
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

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

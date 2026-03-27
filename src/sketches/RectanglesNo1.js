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
const CAMERA_RADIUS_MULT = 11.1;

/** Set false after you map kick/snare from [Track2 Redrum] logs */
const LOG_TRACK2_MIDI_DISCOVERY = false;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

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

  const buildRandomFrame = () => {
    const w = p.random(65, 220) * 24;
    const h = p.random(45, 200) * 24;
    const tube = p.constrain(p.random(2.8, Math.min(w, h) * 0.2), 2.5, 16);
    const xMax = p.width * 4;
    const yMax = p.height * 4;
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
    if (LOG_TRACK2_MIDI_DISCOVERY) {
      console.log('[Track2 Redrum]', {
        cue: note.currentCue,
        midi: note.midi,
        velocity: note.velocity,
        timeSec: note.time,
        ticks: note.ticks,
      });
    }

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
        scatterRadius: p.max(p.width, p.height) * 6,
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
    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
    p.track2BaseHue = p.random(360);
    p.track2HueCurrent = p.track2BaseHue;
    p.track2HueTarget = p.track2BaseHue;
    p.canvas.style.position = 'relative';
    p.canvas.style.zIndex = '1';
    p.perspective(p.PI / 2.75, p.width / p.height, 5, 20000);

    const midiData = await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = data.header.tempos[0]?.bpm ?? 120;
    });
    const track2 = midiData?.tracks?.[2];
    if (track2?.notes?.length) {
      if (LOG_TRACK2_MIDI_DISCOVERY) {
        const counts = new Map();
        for (const n of track2.notes) {
          counts.set(n.midi, (counts.get(n.midi) || 0) + 1);
        }
        const histogram = [...counts.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([midi, count]) => ({ midi, count }));
        console.log(
          `[Track2 Redrum] "${track2.name || '(unnamed)'}" — ${track2.notes.length} notes — MIDI pitch histogram (find kick/snare vs hats):`,
          histogram
        );
      }
      // p.scheduleCueSet(track2.notes, 'onTrack2Cue', true);
    } else {
      console.warn('RectanglesNo1: MIDI track 2 has no notes (check export / track index).');
    }
    const track3 = midiData?.tracks?.[3];
    if (track3?.notes?.length) {
      p.scheduleCueSet(track3.notes, 'onTrack3Cue');
      const phraseStarts = track3.notes
        .filter((n) => n.currentCue && (n.currentCue - 1) % NOTES_PER_PHRASE === 0)
        .map((n) => n.time)
        .sort((a, b) => a - b);
      const songDuration = p.song?.duration?.() ?? 0;
      p.phraseSpans = phraseStarts.map((start, i) => ({
        start,
        end: phraseStarts[i + 1] ?? songDuration,
      }));
    } else {
      console.warn('RectanglesNo1: MIDI track 3 has no notes (check export / track index).');
    }
  };

  p.draw = () => {
    const t = p.millis() * 0.001;
    const orbit = p.max(p.width, p.height) * 0.72;
    const hueDelta = ((p.track2HueTarget - p.track2HueCurrent + 540) % 360) - 180;
    p.track2HueCurrent = (p.track2HueCurrent + hueDelta * 0.2 + 360) % 360;
    p.track2Pulse = p.max(0, p.track2Pulse - 0.025);
    const bgLightness = 8 + p.track2Pulse * 28;
    const bgSaturation = 70 + p.track2Pulse * 20;
    const bgColor = p.color(
      `hsl(${p.track2HueCurrent.toFixed(1)}, ${bgSaturation.toFixed(1)}%, ${bgLightness.toFixed(1)}%)`
    );

    const audioTimeSec =
      typeof p.song?.time === 'function'
        ? p.song.time()
        : Number(p.song?.elt?.currentTime ?? NaN);
    if (Number.isFinite(audioTimeSec) && p.phraseSpans.length) {
      for (const span of p.phraseSpans) {
        if (audioTimeSec >= span.start && audioTimeSec < span.end) {
          const phraseProgress = p.constrain(
            (audioTimeSec - span.start) / Math.max(0.001, span.end - span.start),
            0,
            1
          );
          p.cameraAngleTarget = phraseProgress * p.TWO_PI;
          break;
        }
      }
    }
    const angleDelta = ((p.cameraAngleTarget - p.cameraAngle + p.PI * 3) % p.TWO_PI) - p.PI;
    p.cameraAngle = (p.cameraAngle + angleDelta * 0.12 + p.TWO_PI) % p.TWO_PI;
    const camRadius = p.max(p.width, p.height) * CAMERA_RADIUS_MULT;
    const camX = Math.cos(p.cameraAngle) * camRadius;
    const camZ = Math.sin(p.cameraAngle) * camRadius;
    const camY = Math.sin(t * 0.35) * camRadius * 0.12;
    p.camera(camX, camY, camZ, 0, 0, 0, 0, 1, 0);

    p.background(0);

    p.colorMode(p.RGB, 255);

    const amb = 22 + p.sin(t * 0.35) * 14;
    p.ambientLight(amb * 0.45, amb * 0.35, amb * 0.75);

    const lx1 = p.sin(t * 0.62) * orbit;
    const lz1 = p.cos(t * 0.62) * orbit * 0.85;
    p.pointLight(255, 90, 180, lx1, p.cos(t * 0.48) * orbit * 0.35, 320 + lz1);

    const lx2 = p.sin(t * 0.48 + p.PI * 0.65) * orbit;
    const lz2 = p.cos(t * 0.48 + p.PI * 0.65) * orbit * 0.9;
    p.pointLight(80, 200, 255, lx2, p.sin(t * 0.55) * orbit * 0.4, 280 + lz2);

    const lx3 = p.sin(t * 0.28) * orbit * 0.55;
    const ly3 = p.cos(t * 0.33) * orbit * 0.5;
    p.pointLight(255, 220, 140, lx3, ly3, 480 + p.sin(t * 0.4) * 120);

    p.directionalLight(40, 70, 120, -0.35, 0.4, -0.85);
    p.directionalLight(90, 40, 110, 0.5, -0.2, -0.75);

    const frames = p.midiFrames;
    let depthAnim = p.depthAnim;
    let scatterEase = null;
    let scatterRadius = 0;
    if (depthAnim) {
      const elapsed = p.millis() - depthAnim.startMs;
      scatterEase = p.constrain(elapsed / depthAnim.durationMs, 0, 1);
      scatterRadius = depthAnim.scatterRadius;
      if (scatterEase >= 1) {
        p.depthAnim = null;
        scatterEase = null;
        if (p.pendingPhraseClear) {
          p.midiFrames = [];
          p.pendingPhraseClear = false;
          if (p.pendingFirstFrame) {
            p.midiFrames.push(p.pendingFirstFrame);
            p.pendingFirstFrame = null;
          }
        }
      }
    }

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      let x = f.x;
      let y = f.y;
      let z = f.z;
      if (scatterEase != null) {
        const eased = easeOutCubic(scatterEase);
        const orbitAngle = (i / Math.max(1, frames.length)) * p.TWO_PI + t * 0.35;
        const wave = 0.7 + 0.3 * Math.sin(orbitAngle * 2.3 + f.hue * 0.02);
        const r = scatterRadius * wave;
        const sx = Math.cos(orbitAngle) * r;
        const sy = Math.sin(orbitAngle * 1.7 + f.ry) * r * 0.35;
        const sz = Math.sin(orbitAngle) * r;
        x = p.lerp(sx, f.x, eased);
        y = p.lerp(sy, f.y, eased);
        z = p.lerp(sz, f.z, eased);
      }
      p.push();
      p.translate(x, y, z);
      if (f.rx) p.rotateX(f.rx);
      if (f.ry) p.rotateY(f.ry);
      if (f.rz) p.rotateZ(f.rz);
      const c = p.color(`hsl(${f.hue}, 100%, 52%)`);
      drawRectTubeFrame(p, f.w, f.h, f.tube, c);
      p.pop();
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

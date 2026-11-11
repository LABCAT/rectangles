import p5 from 'p5';
import '@lib/p5.audioReact.js';
import initCapture from '@labcat2020/p5.audioreactive-capture';
import '../lib/p5.fps.js';
import vert from '../shaders/no4Mondrian.vert?raw';
import frag from '../shaders/no4Mondrian.frag?raw';
import { readReelParams, reelSearch, randomSeed, applyPart, resolvePart, barSeconds } from '../lib/reelParams.js';
import { createNo4Look, describeNo4, no4Energy, no4PhraseSeed, NO4_DEFAULT_BPM, NO4_PARTS } from '../lib/no4Look.js';
import { buildNo4Cues, no4CueUniforms } from '../lib/no4Cues.js';

// #RectanglesNo4 — psychedelic WebGL Mondrian.
//
// One shader (src/shaders/no4Mondrian.frag) and a seeded look
// (src/lib/no4Look.js): black-line split-tree compositions in Mondrian's
// primaries, pushed with beat-locked line moves, subdivision builds, colour
// cycling, folds / kaleidoscope, portal zoom and warp.
//
// Music: a copy of #RectanglesNo3's track and MIDI (112 BPM). The MIDI drives
// the events (src/lib/no4Cues.js): guitar riffs re-roll the composition,
// clavinet notes slide lines, the bass bends the grid, kick and snare punch
// and flash, the filter wheeler steps the colours. Cues are looked up from
// the song time, not scheduled, so seeks and captures land on the same frame.
// The beat clock (?bpm=, default NO4_DEFAULT_BPM) drives the continuous
// motion, the parts and the fallback when the MIDI is missing.
//
//   ?seed=  look, reproducible           ?part=  a–g, the track's 4-bar phrases
//   ?bpm=   motion tempo (default 112)   ?beats= loop length in beats (default 16)
//   ?speed= continuous motion speed      ?t=     freeze at a time in seconds (stills)
//   ?auto=  1/0 new look every 8-bar phrase (default on unless ?seed is given)
//   ?uX=    override any scalar uniform, e.g. ?uFold=6
//   ?pd=    pixel density (default 1)    ?fps=0  hide the FPS badge
// Keys: N / P next / previous seed, R random seed, A auto look, I seed info,
// F FPS badge. Clicking the canvas plays/pauses.
//
// Capture: frames are a pure function of time (clock = p.frameNumber / 60,
// absolute song time under section cuts), so p.captureSeekable is on and
// ?part= becomes p.captureRange.

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo4.mp3';
const midiUrl = base + 'audio/RectanglesNo4.mid';

const PHRASE_BARS = 8;

const sketch = (p) => {
  p.loopAudio = true;

  const params = new URLSearchParams(window.location.search);
  const reel = readReelParams(params);
  const bpm = reel.bpm ?? NO4_DEFAULT_BPM;
  const opts = { bpm, beats: reel.beats, speed: reel.speed };
  const phraseSec = barSeconds(bpm) * PHRASE_BARS;
  const partRange = resolvePart(NO4_PARTS, reel.part, { bpm });

  let seed = reel.seed;
  let autoOn = reel.auto;
  let shader = null;
  let info = null;
  let look = null;
  let lookKey = null;

  const syncUrl = () => {
    const q = new URLSearchParams(params);
    for (const [key, value] of new URLSearchParams(reelSearch({ seed, auto: autoOn }))) q.set(key, value);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  };

  // The look for time t: the seed itself, or with auto on, a deterministic
  // step per 8-bar phrase (so capture and playback agree on every frame).
  const lookAt = (t) => {
    const phrase = autoOn ? Math.max(0, Math.floor(t / phraseSec)) : 0;
    const key = `${seed}:${phrase}`;
    if (key !== lookKey) {
      lookKey = key;
      look = createNo4Look(no4PhraseSeed(seed, phrase), opts);
      // Any scalar uniform can be overridden from the URL, e.g. ?uGlow=0.5
      for (const [name, value] of params) {
        if (typeof look.uniforms[name] === 'number' && value !== '') look.uniforms[name] = Number(value);
      }
      if (info) info.textContent = `seed ${look.seed} · ${describeNo4(look)} · ${bpm} bpm`;
      console.log('[RectanglesNo4]', describeNo4(look), look);
    }
    return look;
  };

  const setSeed = (next) => {
    seed = String(next);
    lookKey = null;
    syncUrl();
  };

  const setAuto = (on) => {
    autoOn = on;
    lookKey = null;
    syncUrl();
  };

  // Auto looks change on phrase lines inside a short near-black dip
  // (ledger §11): down over the last 0.3s, back up over the first 0.6s.
  const fadeAt = (t) => {
    if (!autoOn || t < phraseSec * 0.5) return 1;
    const into = ((t % phraseSec) + phraseSec) % phraseSec;
    const toNext = phraseSec - into;
    const floor = 0.12;
    const ease = (x) => x * x * (3 - 2 * x);
    if (toNext < 0.3) return floor + (1 - floor) * ease(toNext / 0.3);
    if (into < 0.6) return floor + (1 - floor) * ease(into / 0.6);
    return 1;
  };

  // Generic audio level: RMS of the decoded buffer around t. A pure function
  // of time (no smoothing state), so it is the same live and in capture.
  // Kept small on purpose (ledger §12: FFT barely reads on full-frame shaders).
  let cues = null;
  let channel = null;
  const levelAt = (t) => {
    if (!channel) {
      const buffer = p.song?.buffer;
      if (!buffer?.getChannelData) return 0;
      channel = { data: buffer.getChannelData(0), rate: buffer.sampleRate };
    }
    const centre = Math.floor(t * channel.rate);
    const span = 2048;
    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, centre - span); i < Math.min(channel.data.length, centre + span); i += 4) {
      sum += channel.data[i] * channel.data[i];
      count++;
    }
    return count ? Math.min(1, Math.sqrt(sum / count) * 3.5) : 0;
  };

  // Seconds: capture frame counter (absolute song time), a frozen ?t, the
  // playing song, or — before the first play — free-running from the part's
  // start so the page is alive.
  let freeClock = partRange?.start ?? 0;
  let hasPlayed = false;
  const timeNow = () => {
    if (p.captureInProgress) return p.frameNumber / 60;
    if (reel.t !== null) return reel.t;
    if (p.song?.isPlaying()) hasPlayed = true;
    if (hasPlayed) return p.getSongPlaybackTime() || 0;
    freeClock += p.deltaTime / 1000;
    return freeClock;
  };

  p.setup = async () => {
    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
    // After createCanvas: p5 resets density to the display's.
    p.pixelDensity(Number(params.get('pd')) || 1);
    p.noStroke();
    shader = p.createShader(vert, frag);

    const prefix = `RectanglesNo4${reel.part ? `-Part${reel.part.toUpperCase()}` : ''}-s${seed}`;
    initCapture(p, { prefix });
    // Frames depend only on time: capture can skip straight to the part.
    p.captureSeekable = true;
    applyPart(p, NO4_PARTS, reel.part, { bpm });

    if (params.get('fps') !== '0') p.enableFpsIndicator({ position: 'bottom-left' });
    window.toggleFps = (o) => p.toggleFpsIndicator({ position: 'bottom-left', ...o });

    info = document.createElement('div');
    info.style.cssText =
      'position:fixed;left:12px;bottom:40px;z-index:10;font:12px monospace;color:#fff;opacity:.7;display:none;pointer-events:none';
    document.body.appendChild(info);
    syncUrl();

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) return;
      const key = e.key.toLowerCase();
      const n = Number(seed);
      if (key === 'n' && Number.isInteger(n)) setSeed(n + 1);
      if (key === 'p' && Number.isInteger(n)) setSeed(Math.max(0, n - 1));
      if (key === 'r') setSeed(randomSeed());
      if (key === 'a') setAuto(!autoOn);
      if (key === 'i') info.style.display = info.style.display === 'none' ? '' : 'none';
      if (key === 'f') p.toggleFpsIndicator({ position: 'bottom-left' });
    });

    const midi = await p.loadSong(audioUrl, midiUrl);
    if (midi?.tracks) cues = buildNo4Cues(midi);
    // Clamp the part to the loaded song.
    applyPart(p, NO4_PARTS, reel.part, { bpm });
  };

  p.draw = () => {
    const t = timeNow();
    const l = lookAt(t);
    p.shader(shader);
    shader.setUniform('uRes', [p.width * p.pixelDensity(), p.height * p.pixelDensity()]);
    shader.setUniform('uTime', t);
    shader.setUniform('uBpm', bpm);
    shader.setUniform('uLoop', l.loopSec);
    shader.setUniform('uEnergy', no4Energy(t, bpm));
    shader.setUniform('uLevel', levelAt(t));
    shader.setUniform('uFade', fadeAt(t));
    for (const [name, value] of Object.entries(no4CueUniforms(cues, t))) shader.setUniform(name, value);
    for (const [name, value] of Object.entries(l.uniforms)) shader.setUniform(name, value);
    p.plane(p.width, p.height);
  };

  p.mouseClicked = () => {
    p.togglePlayback();
  };

  // Called by the audio engine on loop/restart. Every frame is a function of
  // the song time, so there is no per-pass state to clear.
  p.resetAnimation = () => {};

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

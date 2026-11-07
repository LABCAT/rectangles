import p5 from 'p5';
import '@lib/p5.audioReact.js';
import '../lib/p5.fps.js';
import { readReelParams, applyPart, resolvePart, createRng } from '../lib/reelParams.js';
import { NO3_PARTS, NO3_BPM } from '../lib/no3Look.js';
import initCapture from '@labcat2020/p5.audioreactive-capture';
import { createDomLayerCaptureBackground } from '@labcat2020/p5.audioreactive-capture/dom-layer';
import { compositeDomCaptureExtension } from '@labcat2020/p5.audioreactive-capture/composite';
import { no3BackgroundCss, NO3_BG_BLEND } from './functions/no3BackgroundGradientCss.js';
import { drawBlackVeil } from './functions/blackVeilRects.js';

// #RectanglesNo3 — Piet Mondrian grid (2021).
// Straight port of LABCAT/rectangles-no-3 (CRA + Tone.js) to the series'
// @labcat2020 conventions. Same visuals: 60 random compositions of 1–4 cell
// rectangles on a 16×16 grid, swapped on MIDI cues.
//
// Track 112 BPM, 4/4, ~60s. MIDI cue sets (non-poly, one cue per tick):
//   track 3 "Sampler 1" (heavy guitar)   cues 1–10: a new composition each
//                                        cue; cues > 20: re-roll the three
//                                        colours (black + white stay)
//   track 5 "Sampler 3" (clavinet)       cues 34–159: build a composition
//                                        piece by piece, 33 cues per build
//   track 0 "Synth 1" (filter wheeler)   cues > 6: a new composition each cue
// State lives on `p` and is drawn every frame (capture-safe); cues only
// change what is shown.
//
// Parts: ?part=a–g (NO3_PARTS, the track's seven 4-bar phrases, back to back)
// starts the page on that part and sets p.captureRange so a capture renders
// just it. Prev/next in the control panel walk the parts; playing on flows
// into the next part with the music, and after the last back to part A. A
// jump rebuilds the cue state by replaying every cue before it. The address
// bar follows (?part=).

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo3.mp3';
const midiUrl = base + 'audio/RectanglesNo3.mid';

const GRID = 16;
const COMPOSITION_COUNT = 60;
const BUILD_CUES = 33;
// Rectangle fill alpha (0–255): slightly see-through over the cleared canvas.
const RECT_ALPHA = 165;
// Single-hit reveals are a domino run in a random order: each hit shuffles
// the composition, and the rectangles spring in one after another, evenly
// spaced over the first REVEAL_DOMINO of the window (so any rectangle, any
// where, can land first or last). The window fits the gap to the next hit
// (REVEAL_FILL of it, at most REVEAL_MAX seconds), so riffs get a slow run
// and fast wheeler notes a quick one. Timed from the cue's note time and song
// time, so seeks and captures match.
const REVEAL_MAX = 0.75;
const REVEAL_FILL = 0.9;
const REVEAL_DOMINO = 0.7; // share of the window the domino run spreads over
// Every rectangle's spring is this long, whatever the gap (so riffs, wheeler
// notes and clavinet pieces all bounce the same).
const REVEAL_POP = 0.25;
// Clavinet builds use the same spring: each cue's new batch dominoes in (random
// order) over REVEAL_DOMINO of the gap to the next cue; earlier pieces stay.
const RECT_SCALE = 0.95;

// Background: the series' stacked CSS wash (see no3BackgroundGradientCss.js),
// a new one per composition, with No1's black veil (rect rings, darker to the
// edges) drawn in front of it at VEIL_OPACITY.
const VEIL_OPACITY = 0.55;

/** Damped spring 0 → 1: overshoots, wobbles back, settles by k = 1. */
const spring = (k, wobble) => 1 - Math.exp(-5 * k) * Math.cos(k * Math.PI * wobble);

/** 0–1 hash: the same rectangle on the same hit always gets the same value. */
const hash01 = (a, b, c) => {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

const MONDRIAN_COLOURS = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
  { r: 221, g: 1, b: 0 },
  { r: 34, g: 80, b: 149 },
  { r: 250, g: 201, b: 1 },
];

const sketch = (p) => {
  const reel = readReelParams();
  p.loopAudio = true;

  p.colours = MONDRIAN_COLOURS;
  p.multipliers = [1, 2, 3, 4];
  p.rectangleGrid = [];
  p.compositions = [];
  p.currentComposition = 0;

  /** What draw() shows: a list of rectangles and the colours they were drawn with. */
  p.shown = [];
  p.shownColours = MONDRIAN_COLOURS;

  p.rectangles = [];
  p.currentPointer = 0;
  p.rectanglesPerCue = 0;
  p.rectanglesToDraw = [];
  p.buildTiming = [];
  p.currentCue1 = 1;
  p.currentCue2 = 1;
  p.currentCue3 = 1;

  /** Song time of the current single-hit reveal (null: show it all at once). */

  // Background wash for what's shown: keyed on the composition and palette,
  // so a seek or capture lands on the same one.
  p.bgGradientEl = null;
  let bgCss = '';
  const applyBackground = () => {
    if (!p.bgGradientEl) return;
    const key = `${p.currentComposition}:${p.shownColours.map((c) => `${c.r},${c.g},${c.b}`).join(';')}`;
    const css = no3BackgroundCss(p.shownColours, key);
    if (css === bgCss) return;
    bgCss = css;
    p.bgGradientEl.style.background = css;
    p.bgGradientEl.style.backgroundBlendMode = NO3_BG_BLEND;
  };

  /**
   * Spring timings for `rectangles` landing at song time `at`: a domino run in
   * a random order (shuffled per hit) over REVEAL_DOMINO of `win`, each one a
   * REVEAL_POP spring.
   */
  const dominoTimings = (rectangles, at, win) => {
    const order = createRng(`no3-reveal:${at}`).shuffle(rectangles.map((_, i) => i));
    const n = Math.max(1, rectangles.length - 1);
    const pop = REVEAL_POP;
    const timings = [];
    order.forEach((idx, rank) => {
      timings[idx] = { start: at + win * REVEAL_DOMINO * (rank / n), pop, wobble: 2.2 + 1.6 * hash01(idx, rank, at) };
    });
    return timings;
  };

  /** Per shown rectangle: its spring { start, pop, wobble }, or none (just there). */
  p.rectTiming = [];

  // `timings`: a hit time for a full domino reveal, an array of per-rectangle
  // timings (builds), or null (all at once).
  const show = (rectangles, timings = null, revealWindow = REVEAL_MAX) => {
    p.shown = rectangles;
    p.shownColours = p.colours;
    if (Array.isArray(timings)) p.rectTiming = timings;
    else if (timings !== null) p.rectTiming = dominoTimings(rectangles, timings, revealWindow);
    else p.rectTiming = [];
    applyBackground();
  };

  const nextComposition = () => {
    const composition = p.compositions[p.currentComposition] ?? [];
    p.currentComposition++;
    return composition;
  };

  p.createComposition = () => {
    p.rectangles = [];
    p.rectangleGrid = p.rectangleGrid.map((obj) => ({ ...obj, empty: true }));
    let spaceAvailable = p.rectangleGrid.some((obj) => obj.empty);
    while (spaceAvailable) {
      const cell = p.random(p.rectangleGrid.filter((obj) => obj.empty));
      const { x, y } = cell;
      let widthMultiplier = x < GRID ? p.random(p.multipliers) : 1;
      let heightMultiplier = y < GRID ? p.random(p.multipliers) : 1;
      widthMultiplier = x + widthMultiplier > GRID ? GRID + 1 - x : widthMultiplier;
      heightMultiplier = y + heightMultiplier > GRID ? GRID + 1 - y : heightMultiplier;
      p.rectangles.push({
        x,
        y,
        widthMultiplier,
        heightMultiplier,
        colourIndex: Math.floor(p.random(0, 5)),
      });
      for (let i = x; i < x + widthMultiplier; i++) {
        for (let j = y; j < y + heightMultiplier; j++) {
          const index = p.rectangleGrid.findIndex((obj) => obj.x === i && obj.y === j);
          p.rectangleGrid[index].empty = false;
        }
      }
      spaceAvailable = p.rectangleGrid.some((obj) => obj.empty);
    }
  };

  p.createCompositions = () => {
    p.compositions = [];
    for (let i = 0; i < COMPOSITION_COUNT; i++) {
      p.createComposition();
      p.compositions.push(p.rectangles);
    }
    p.rectangles = [];
  };

  p.drawRect = (rectangle, cellWidth, cellHeight, t = Infinity, index = 0) => {
    const { x, y, widthMultiplier, heightMultiplier, colourIndex } = rectangle;
    const colour = p.shownColours[colourIndex];
    p.fill(colour.r, colour.g, colour.b, RECT_ALPHA);
    // Centre-positioned (rectMode CENTER, set in setup). Grid cells are
    // 1-based, so cell x spans (x - 1)…x cell widths; same frame as CORNER.
    const cx = cellWidth * (x - 1 + widthMultiplier / 2);
    const cy = cellHeight * (y - 1 + heightMultiplier / 2);
    let scale = RECT_SCALE;
    const timing = p.rectTiming[index];
    if (timing) {
      // Waits for its turn in the domino run, then springs in (own wobble).
      const k = (t - timing.start) / timing.pop;
      if (k <= 0) return;
      if (k < 1) scale *= spring(k, timing.wobble);
    }
    p.rect(cx, cy, cellWidth * widthMultiplier * scale, cellHeight * heightMultiplier * scale);
  };

  p.setup = async () => {
    p.pixelDensity(1);
    p.createCanvas(window.innerWidth, window.innerHeight);

    // Background wash behind the cleared canvas: the gradient in
    // one fixed wrapper (one only: drop any left over from a hot reload).
    // Capture composites the wrapper under each frame.
    document.querySelectorAll('#no3-gradient-bg, [data-no3-bg]').forEach((el) => el.remove());
    const bgWrap = document.createElement('div');
    bgWrap.setAttribute('data-no3-bg', '1');
    bgWrap.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
    p.bgGradientEl = document.createElement('div');
    p.bgGradientEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    bgWrap.append(p.bgGradientEl);
    document.body.insertBefore(bgWrap, document.body.firstChild);
    p.bgWrapperEl = bgWrap;
    initCapture(p, {
      prefix: 'RectanglesNo3',
      enabled: false,
      captureCSSBackground: true,
      extension: compositeDomCaptureExtension({ background: createDomLayerCaptureBackground(bgWrap) }),
    });
    p.colorMode(p.RGB, 255);
    p.rectMode(p.CENTER);

    // FPS badge — always on, in the control panel (open it to see it); window.toggleFps() / press F hides it
    p.enableFpsIndicator();
    window.toggleFps = (opts) => p.toggleFpsIndicator(opts);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'f') p.toggleFpsIndicator();
    });

    p.rectangleGrid = [];
    for (let i = 1; i <= GRID; i++) {
      for (let j = 1; j <= GRID; j++) {
        p.rectangleGrid.push({ x: i, y: j, empty: true });
      }
    }
    p.createCompositions();
    // Open on the first composition (the one cue 1 shows), not a blank white canvas.
    show(p.compositions[0]);

    const midiData = await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = 112;
    });

    if (midiData?.tracks) {
      p.scheduleCueSet(midiData.tracks[3]?.notes ?? [], 'executeCueSet1'); // Sampler 1 - Heavy guitar
      p.scheduleCueSet(midiData.tracks[5]?.notes ?? [], 'executeCueSet2'); // Sampler 3 - Clavinet D6
      p.scheduleCueSet(midiData.tracks[0]?.notes ?? [], 'executeCueSet3'); // Synth 1 - Filter Wheeler
      // Reveal tracks (single hits + the clavinet builds): each note learns the
      // gap to the next hit, so its reveal fits before the next one lands.
      for (const track of [midiData.tracks[3], midiData.tracks[5], midiData.tracks[0]]) {
        const times = [...new Set((track?.notes ?? []).map((n) => n.time))].sort((a, b) => a - b);
        for (const n of track?.notes ?? []) {
          const next = times.find((t) => t > n.time + 1e-4);
          n.revealWindow = Math.min(REVEAL_MAX, next === undefined ? REVEAL_MAX : (next - n.time) * REVEAL_FILL);
        }
      }
    }

    // ?part= → p.captureRange (capture renders just that part); without it a
    // capture renders the whole track. Live: start on the part (?part= or A).
    applyPart(p, NO3_PARTS, reel.part, { bpm: NO3_BPM });
    partRange = partRangeOf(partId);
    p._playbackFrozenSec = partRange.start;
    replayCuesBefore(partRange.start);
    guardStaleStops();
    syncUrl();
    emitTrack();
    window.addEventListener('labcat:track-prev', () => stepPart(-1));
    window.addEventListener('labcat:track-next', () => stepPart(1));

    // The first play starts the audio (and the clock) on the part. The play
    // button and a canvas click both call p.togglePlayback.
    const baseToggle = p.togglePlayback;
    p.togglePlayback = function () {
      const first = !partStarted && !this.captureEnabled && this.audioLoaded && !this.song?.isPlaying();
      if (first) {
        partStarted = true;
        replayCuesBefore(partRange.start);
        this._playbackFrozenSec = partRange.start;
        startNextPlayAt(partRange.start);
      }
      baseToggle.call(this);
    };
  };

  // --- Parts and the address bar ---------------------------------------------

  const PART_IDS = Object.keys(NO3_PARTS);
  let partId = NO3_PARTS[reel.part] ? reel.part : PART_IDS[0];
  let partRange = null;
  let partStarted = false;

  const partRangeOf = (id) => {
    const range = resolvePart(NO3_PARTS, id, { bpm: NO3_BPM });
    const duration = p.song?.duration?.();
    if (Number.isFinite(duration) && duration > 0) range.end = Math.min(range.end, duration);
    return range;
  };

  const syncUrl = () => {
    const q = new URLSearchParams(window.location.search);
    q.set('part', partId);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  };

  const emitTrack = () => {
    const title = `Part ${partId.toUpperCase()} · ${NO3_PARTS[partId].name}`;
    window.dispatchEvent(new CustomEvent('labcat:track', { detail: { title } }));
  };

  // Rebuild the cue-driven state at song time `t`, as straight playback would
  // have it: reset, then fire every cue before `t` at once.
  const replayCuesBefore = (t) => {
    resetCueState();
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
    if (!sf || sf._no3Guarded) return;
    sf._no3Guarded = true;
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
        console.warn('[RectanglesNo3] seek failed', e);
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
      partStarted = true;
    }
    if (p.song?.isPlaying()) {
      p._playbackSongSecondsAtWallStart = sec;
      p._playbackWallStartPerf = performance.now();
      p._reindexMidiCues(sec);
    } else {
      p._playbackFrozenSec = sec;
    }
  };

  // Follow the music into part `id` without moving the playhead.
  const flowInto = (id) => {
    partId = id;
    partRange = partRangeOf(id);
    syncUrl();
    emitTrack();
  };

  // Jump to the start of part `id`.
  const setPart = (id) => {
    flowInto(id);
    jumpTo(partRange.start);
  };

  // Prev on the first part restarts it; next on the last goes back to part A.
  const stepPart = (d) => {
    const n = PART_IDS.indexOf(partId) + d;
    setPart(PART_IDS[n >= PART_IDS.length ? 0 : Math.max(0, n)]);
  };

  // Live: at the end of a part go on to the next. Back-to-back parts just
  // carry on; a gap (bars between parts) is jumped over. After the last part,
  // back to the first.
  const advancePart = () => {
    const i = PART_IDS.indexOf(partId);
    const nextId = PART_IDS[(i + 1) % PART_IDS.length];
    const end = partRange.end;
    const nextStart = partRangeOf(nextId).start;
    if (Math.abs(nextStart - end) < 1e-3) flowInto(nextId);
    else setPart(nextId);
  };

  // Capture fires every cue from 0 into the state it finds, so start it clean
  // (the live page may have replayed cues up to a ?part= already). No cue
  // lands at 0, so the first captured frame's draw runs before any cue.
  let captureReset = false;

  p.draw = () => {
    if (p.captureInProgress && !captureReset) resetCueState();
    captureReset = !!p.captureInProgress;

    if (partRange && !p.captureInProgress && p.song?.isPlaying() && p.getSongPlaybackTime() >= partRange.end) {
      advancePart();
    }

    const t = p.getSongPlaybackTime();
    p.clear();
    drawBlackVeil(p, VEIL_OPACITY);
    p.stroke(0);
    p.strokeWeight(4);
    const cellWidth = p.width / GRID;
    const cellHeight = p.height / GRID;
    for (let i = 0; i < p.shown.length; i++) {
      p.drawRect(p.shown[i], cellWidth, cellHeight, Number.isFinite(t) ? t : Infinity, i);
    }
  };

  p.executeCueSet1 = (note) => {
    if (p.currentCue1 <= 10) {
      p.rectangles = nextComposition();
      show(p.rectangles, note?.time ?? null, note?.revealWindow ?? REVEAL_MAX);
    }

    if (p.currentCue1 > 20) {
      p.colours = [
        MONDRIAN_COLOURS[0],
        MONDRIAN_COLOURS[1],
        { r: p.random(255), g: p.random(255), b: p.random(255) },
        { r: p.random(255), g: p.random(255), b: p.random(255) },
        { r: p.random(255), g: p.random(255), b: p.random(255) },
      ];
    }
    p.currentCue1++;
  };

  p.executeCueSet2 = (note) => {
    if (p.currentCue2 > BUILD_CUES && p.currentCue2 <= BUILD_CUES * 5 - 6) {
      const modulo = p.currentCue2 % BUILD_CUES;
      if (modulo === 1) {
        p.rectangles = nextComposition();
        p.rectanglesToDraw = [];
        p.buildTiming = [];
        p.currentPointer = 0;
        p.rectanglesPerCue = Math.floor(p.rectangles.length / BUILD_CUES);
      }

      if (p.currentPointer < p.rectangles.length) {
        const limit = Math.min(p.rectanglesPerCue * modulo, p.rectangles.length);
        const batch = p.rectangles.slice(p.currentPointer, limit);
        const at = note?.time;
        const timings = Number.isFinite(at) ? dominoTimings(batch, at, note.revealWindow ?? REVEAL_MAX) : [];
        batch.forEach((rect, j) => {
          p.rectanglesToDraw.push(rect);
          p.buildTiming.push(timings[j]);
        });
        p.currentPointer = p.rectanglesPerCue * modulo;
      }

      show([...p.rectanglesToDraw], [...p.buildTiming]);
    }
    p.currentCue2++;
  };

  p.executeCueSet3 = (note) => {
    if (p.currentCue3 > 6) {
      p.rectangles = nextComposition();
      show(p.rectangles, note?.time ?? null, note?.revealWindow ?? REVEAL_MAX);
    }
    p.currentCue3++;
  };

  // Fresh compositions and cue counters, as at the top of the track.
  const resetCueState = () => {
    p.colours = MONDRIAN_COLOURS;
    p.createCompositions();
    p.currentComposition = 0;
    show(p.compositions[0]);
    p.shownColours = MONDRIAN_COLOURS;
    p.currentPointer = 0;
    p.rectanglesPerCue = 0;
    p.rectanglesToDraw = [];
    p.buildTiming = [];
    p.currentCue1 = 1;
    p.currentCue2 = 1;
    p.currentCue3 = 1;
  };

  // Called by the audio engine when the song ends and restarts from 0: back
  // to part A with a clean slate.
  p.resetAnimation = () => {
    resetCueState();
    if (partRange && partId !== PART_IDS[0]) flowInto(PART_IDS[0]);
  };

  p.mouseClicked = () => {
    p.togglePlayback();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

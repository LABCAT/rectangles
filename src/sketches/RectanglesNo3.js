import p5 from 'p5';
import '@lib/p5.audioReact.js';
import '../lib/p5.fps.js';
import { readReelParams, applyPart, resolvePart, createRng, randomSeed } from '../lib/reelParams.js';
import {
  NO3_PARTS,
  NO3_BPM,
  NO3_PALETTES,
  createNo3Look,
  createComposition,
  describeNo3Look,
  boardFor,
} from '../lib/no3Look.js';
import initCapture from '@labcat2020/p5.audioreactive-capture';
import { createDomLayerCaptureBackground } from '@labcat2020/p5.audioreactive-capture/dom-layer';
import { compositeDomCaptureExtension } from '@labcat2020/p5.audioreactive-capture/composite';
import { no3BackgroundCss, NO3_BG_BLEND } from './functions/no3BackgroundGradientCss.js';
import { drawBlackVeil } from './functions/blackVeilRects.js';
import { drawBoogieWindow } from './functions/boogieWoogieWindow.js';

// #RectanglesNo3 — Piet Mondrian grid (2021).
// Port of LABCAT/rectangles-no-3 (CRA + Tone.js) to the series' @labcat2020
// conventions: random compositions of 1–4 cell rectangles on a square grid,
// swapped on MIDI cues. Seeded (?seed=, see lib/no3Look.js): the seed picks
// part A's palette, the palettes the re-rolls step through, and each
// clavinet build's grid (density climbing B → E) and build order. Every
// composition comes from (seed, cue), so seeks, replays and captures match.
//
// Track 112 BPM, 4/4, ~60s. MIDI cue sets (non-poly, one cue per tick):
//   track 3 "Sampler 1" (heavy guitar)   cues 1–10: a new composition each
//                                        cue (16×16); cues > 20: step to the
//                                        seed's next palette
//   track 5 "Sampler 3" (clavinet)       cues 34–159: four builds, 33 cues
//                                        each, piece by piece on the seed's
//                                        grid and order for that build
//   track 0 "Synth 1" (filter wheeler)   cues > 6: a new composition each cue
//                                        (16×16)
// State lives on `p` and is drawn every frame (capture-safe); cues only
// change what is shown. N / P step the seed, R picks a random one.
//
// Parts: ?part=a–g (NO3_PARTS, the track's seven 4-bar phrases, back to back)
// starts the page on that part and sets p.captureRange so a capture renders
// just it. Prev/next in the control panel walk the parts; playing on flows
// into the next part with the music, and after the last back to part A. A
// jump rebuilds the cue state by replaying every cue before it. The address
// bar follows (?part=&seed=).

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo3.mp3';
const midiUrl = base + 'audio/RectanglesNo3.mid';

/**
 * Grid for the single-hit compositions (guitar riffs, wheeler): the 2021
 * board's 16×16 density, as square cells on any screen shape (lib/no3Look.js
 * boardFor: about 21×12 on desktop, 11×23 on a phone, 12×21 in a 9:16 reel).
 */
const GRID = 16;
const BUILD_CUES = 33;
const BAR_SEC = (60 / NO3_BPM) * 4;
/** 1-based bar a song time falls in (MIDI times land a hair early, hence the nudge). */
const barOf = (t) => Math.floor(t / BAR_SEC + 1e-3) + 1;
// Every 4th bar the guitar strums each beat. Each strum is a full bouncy
// reveal (bars 4–16; from bar 20 the wheeler owns the single hits), and the
// clavinet build pauses for it: builds complete over their first 3 bars.
const isStrumBar = (t) => Number.isFinite(t) && barOf(t) % 4 === 0;
const BUILD_BARS = 3;
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

// Magic rectangles (lib/no3Look.js picks them, seeded): Boogie Woogie windows.
// Their traffic hops one square on every drum hit (Redrum, track 8), easing
// over BOOGIE_HOP_SEC, and drifts at BOOGIE_DRIFT hops a second on top (so it
// moves before the drums come in at bar 5).
const BOOGIE_HOP_SEC = 0.1;
const BOOGIE_DRIFT = 0.8;
const DRUM_TRACK = 8;

/** Damped spring 0 → 1: overshoots, wobbles back, settles by k = 1. */
const spring = (k, wobble) => 1 - Math.exp(-5 * k) * Math.cos(k * Math.PI * wobble);

/** 0–1 hash: the same rectangle on the same hit always gets the same value. */
const hash01 = (a, b, c) => {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

const sketch = (p) => {
  const reel = readReelParams();
  p.loopAudio = true;

  let look = createNo3Look(reel.seed);
  p.reelSeed = look.seed;

  p.colours = NO3_PALETTES[look.palette];

  /** What draw() shows: rectangles, their colours, their board ({ cols, rows }), and a key for the background. */
  p.shown = [];
  p.shownColours = p.colours;
  p.shownBoard = { cols: GRID, rows: GRID };
  p.shownKey = '';

  p.rectangles = [];
  p.currentPointer = 0;
  p.rectanglesToDraw = [];
  p.buildTiming = [];
  p.currentCue1 = 1;
  p.currentCue2 = 1;
  p.currentCue3 = 1;

  // Background wash for what's shown: keyed on the composition and palette,
  // so a seek or capture lands on the same one.
  p.bgGradientEl = null;
  let bgCss = '';
  const applyBackground = () => {
    if (!p.bgGradientEl) return;
    const key = `${look.seed}:${p.shownKey}:${p.shownColours.map((c) => `${c.r},${c.g},${c.b}`).join(';')}`;
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
    // The run fits the gap so every spring finishes before the next hit.
    const spread = Math.min(win * REVEAL_DOMINO, Math.max(0, win - pop));
    const timings = [];
    order.forEach((idx, rank) => {
      timings[idx] = { start: at + spread * (rank / n), pop, wobble: 2.2 + 1.6 * hash01(idx, rank, at) };
    });
    return timings;
  };

  /** Per shown rectangle: its spring { start, pop, wobble }, or none (just there). */
  p.rectTiming = [];

  // `timings`: a hit time for a full domino reveal, an array of per-rectangle
  // timings (builds), or null (all at once). `key` names the composition.
  const show = (rectangles, timings = null, revealWindow = REVEAL_MAX, board = boardOf(GRID), key = '') => {
    p.shown = rectangles;
    p.shownColours = p.colours;
    p.shownBoard = board;
    p.shownKey = key;
    if (Array.isArray(timings)) p.rectTiming = timings;
    else if (timings !== null) p.rectTiming = dominoTimings(rectangles, timings, revealWindow);
    else p.rectTiming = [];
    applyBackground();
  };

  /** A composition from (seed, key): the same key always gives the same one. */
  /** The board for `grid` cells across the short side of the current canvas. */
  const boardOf = (grid) => boardFor(grid, p.width || window.innerWidth, p.height || window.innerHeight);
  const compose = (key, board = boardOf(GRID), order = 'random') =>
    createComposition(look.seed, key, board.cols, board.rows, order);

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
    const w = cellWidth * widthMultiplier * scale;
    const h = cellHeight * heightMultiplier * scale;
    p.rect(cx, cy, w, h);
    if (rectangle.magic) {
      drawBoogieWindow(p, { cx, cy, w, h, colours: p.shownColours, salt: x * 31 + y * 17, travel: p.boogieTravel });
      // The black outline back on top of the window.
      p.push();
      p.noFill();
      p.rect(cx, cy, w, h);
      p.pop();
    }
  };

  // Drum-hit times (sorted, one per tick), for the Boogie Woogie traffic.
  let drumTimes = [];

  /** Hops the traffic has made by song time `t`: one per drum hit, eased, plus drift. */
  const boogieTravelAt = (t) => {
    let lo = 0;
    let hi = drumTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (drumTimes[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    let hops = 0;
    if (lo > 0) {
      const k = Math.min(1, (t - drumTimes[lo - 1]) / BOOGIE_HOP_SEC);
      hops = lo - 1 + (1 - (1 - k) * (1 - k));
    }
    return hops + t * BOOGIE_DRIFT;
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
      const k = e.key.toLowerCase();
      if (k === 'f') p.toggleFpsIndicator();
      else if (k === 'n') stepSeed(1);
      else if (k === 'p') stepSeed(-1);
      else if (k === 'r') setSeed(randomSeed());
    });

    // Open on the first composition (the one cue 1 shows), not a blank canvas.
    resetCueState();
    logLook();

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
      drumTimes = [...new Set((midiData.tracks[DRUM_TRACK]?.notes ?? []).map((n) => n.time))].sort((a, b) => a - b);
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
    q.set('seed', look.seed);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  };

  const logLook = () => console.log(`[RectanglesNo3] seed ${look.seed} · ${describeNo3Look(look)}`);

  // A new seed shows at once: the cues so far replayed with it.
  const setSeed = (next) => {
    look = createNo3Look(String(next));
    p.reelSeed = look.seed;
    const t = p.getSongPlaybackTime();
    replayCuesBefore(Number.isFinite(t) ? t : 0);
    syncUrl();
    logLook();
  };

  const stepSeed = (d) => {
    const n = Number(look.seed);
    setSeed(Number.isInteger(n) ? Math.max(0, n + d) : randomSeed());
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
    p.boogieTravel = boogieTravelAt(Number.isFinite(t) ? t : 0);
    p.clear();
    drawBlackVeil(p, VEIL_OPACITY);
    p.stroke(0);
    p.strokeWeight(4);
    const cellWidth = p.width / p.shownBoard.cols;
    const cellHeight = p.height / p.shownBoard.rows;
    for (let i = 0; i < p.shown.length; i++) {
      p.drawRect(p.shown[i], cellWidth, cellHeight, Number.isFinite(t) ? t : Infinity, i);
    }
  };

  p.executeCueSet1 = (note) => {
    // Part A's riffs (cues 1–10), then every strum of a 4th bar until the
    // wheeler takes over — on the current build's grid.
    const strum = isStrumBar(note?.time) && p.currentCue3 <= 6;
    if (p.currentCue1 <= 10 || strum) {
      const key = `g${p.currentCue1}`;
      const board = boardOf(p.currentCue1 <= 10 ? GRID : p.buildGrid);
      p.rectangles = compose(key, board);
      show(p.rectangles, note?.time ?? null, note?.revealWindow ?? REVEAL_MAX, board, key);
    }

    // From bar 9: each riff steps to the seed's next palette (shown with the
    // next composition / build piece).
    if (p.currentCue1 > 20) {
      p.colours = NO3_PALETTES[look.rerolls[(p.currentCue1 - 21) % look.rerolls.length]];
    }
    p.currentCue1++;
  };

  p.executeCueSet2 = (note) => {
    if (p.currentCue2 > BUILD_CUES && p.currentCue2 <= BUILD_CUES * 5 - 6) {
      const modulo = p.currentCue2 % BUILD_CUES;
      if (modulo === 1) {
        // Build 0–3 (parts B–E): the seed's grid and build order for it.
        p.buildIndex = Math.floor((p.currentCue2 - 1) / BUILD_CUES) - 1;
        const build = look.builds[p.buildIndex] ?? { grid: GRID, order: 'random' };
        p.buildGrid = build.grid;
        p.rectangles = compose(`b${p.buildIndex}`, boardOf(build.grid), build.order);
        p.rectanglesToDraw = [];
        p.buildTiming = [];
        p.currentPointer = 0;
        p.buildStart = note?.time ?? 0;
      }

      if (p.currentPointer < p.rectangles.length) {
        // By time: all the pieces down by the end of the build's 3rd bar
        // (the 4th is the strum bar), whatever the grid's piece count.
        const dt = (note?.time ?? p.buildStart) - p.buildStart;
        const share = Math.min(1, (dt + BAR_SEC / 8) / (BUILD_BARS * BAR_SEC));
        const limit = Math.min(p.rectangles.length, Math.ceil(p.rectangles.length * share));
        const batch = p.rectangles.slice(p.currentPointer, limit);
        const at = note?.time;
        const timings = Number.isFinite(at) ? dominoTimings(batch, at, note.revealWindow ?? REVEAL_MAX) : [];
        batch.forEach((rect, j) => {
          p.rectanglesToDraw.push(rect);
          p.buildTiming.push(timings[j]);
        });
        p.currentPointer = limit;
      }

      // The strum bar (and the wheeler, from bar 20) own the screen; the build
      // keeps counting underneath.
      if (!isStrumBar(note?.time) && p.currentCue3 <= 6) {
        show([...p.rectanglesToDraw], [...p.buildTiming], REVEAL_MAX, boardOf(p.buildGrid), `b${p.buildIndex}`);
      }
    }
    p.currentCue2++;
  };

  p.executeCueSet3 = (note) => {
    if (p.currentCue3 > 6) {
      const key = `w${p.currentCue3}`;
      p.rectangles = compose(key);
      show(p.rectangles, note?.time ?? null, note?.revealWindow ?? REVEAL_MAX, boardOf(GRID), key);
    }
    p.currentCue3++;
  };

  // Cue state as at the top of the track: the seed's part-A palette, showing
  // the composition cue 1 brings in.
  const resetCueState = () => {
    p.colours = NO3_PALETTES[look.palette];
    show(compose('g1'), null, REVEAL_MAX, boardOf(GRID), 'g1');
    p.currentPointer = 0;
    p.buildStart = 0;
    p.buildIndex = -1;
    p.buildGrid = GRID;
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

  // A new screen shape is a new board: rebuild what's showing for it.
  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    const t = p.getSongPlaybackTime();
    replayCuesBefore(Number.isFinite(t) ? t : 0);
  };
};

new p5(sketch);

/**
 * reelParams — shared seed + URL params for #Rectangles reels.
 *
 * One sketch, many reels: the look comes from `?seed=`, the capture window
 * from `?part=`. Pure ES module with no browser globals at import time, so the
 * lab's `pnpm seed:table` can import look modules that use it from plain Node.
 *
 * URL params (all optional), read by `readReelParams(search)`:
 *   ?seed=   look, reproducible (any string; integers are used as-is).
 *            Absent → a random seed is drawn and `hasSeed` is false.
 *   ?bpm=    motion tempo override; null when absent (use the track's).
 *   ?beats=  loop length in beats (default 16).
 *   ?speed=  motion speed multiplier (default 1).
 *   ?t=      freeze at a time in seconds (stills); null when absent.
 *   ?auto=   1/0 new look on every part/loop (default: on unless ?seed given).
 *   ?part=   part id to play and capture (e.g. a / b / c); null when absent.
 *
 * Usage in a sketch:
 *   import { readReelParams, createRng, applyPart } from '../lib/reelParams.js';
 *   const reel = readReelParams(window.location.search);
 *   const rng = createRng(reel.seed);
 *   const hue = rng.range(0, 360);
 *   // after loadSong(), with the track's own tempo:
 *   applyPart(p, { a: { bars: [1, 8] }, b: { start: 30, end: 45 } }, reel.part, { bpm: 112 });
 *
 * Capture contract (@labcat2020/p5.audioreactive-capture >= 0.1.5):
 * `p.captureRange = { start, end }` (seconds) set before capture starts makes
 * the capture fast-forward the earlier frames and write absolute frame numbers.
 */

const DEFAULT_BEATS = 16;
const DEFAULT_SPEED = 1;
const DEFAULT_BEATS_PER_BAR = 4;

/** Seeded PRNG: integer state in, `() => float in [0, 1)` out. */
export const mulberry32 = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Seed (number or string) → uint32. Integers pass through; strings are FNV-1a hashed. */
export const seedToInt = (seed) => {
  const n = Number(seed);
  if (String(seed).trim() !== '' && Number.isInteger(n)) return n >>> 0;
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** A fresh random seed, as a short numeric string (matches portals). */
export const randomSeed = () => String(Math.floor(Math.random() * 100000));

/**
 * Seeded random helpers. Same seed → same sequence.
 * @param {string|number} seed
 * @returns {{ seed: string, random: () => number, range: (min: number, max: number) => number,
 *   int: (min: number, max: number) => number, pick: <T>(arr: T[]) => T,
 *   chance: (p?: number) => boolean, shuffle: <T>(arr: T[]) => T[] }}
 */
export const createRng = (seed) => {
  const random = mulberry32(seedToInt(seed));
  // Warm up: the first draws of mulberry32 correlate with small seeds.
  for (let i = 0; i < 4; i++) random();
  const range = (min = 0, max = 1) => min + (max - min) * random();
  // Inclusive integer in [min, max].
  const int = (min, max) => Math.floor(range(min, max + 1));
  const pick = (arr) => arr[Math.floor(random() * arr.length)];
  const chance = (p = 0.5) => random() < p;
  // Fisher–Yates on a copy.
  const shuffle = (arr) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { seed: String(seed), random, range, int, pick, chance, shuffle };
};

const toParams = (search) => {
  if (search instanceof URLSearchParams) return search;
  if (typeof search === 'string') return new URLSearchParams(search);
  const live = typeof globalThis.location !== 'undefined' ? globalThis.location.search : '';
  return new URLSearchParams(live ?? '');
};

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Parse the reel params from a query string (`'?seed=4&part=a'`), a
 * URLSearchParams, or — when omitted in the browser — `location.search`.
 * @returns {{ seed: string, hasSeed: boolean, bpm: number|null, beats: number,
 *   speed: number, t: number|null, auto: boolean, part: string|null }}
 */
export const readReelParams = (search) => {
  const params = toParams(search);
  const rawSeed = params.get('seed');
  const hasSeed = rawSeed !== null && rawSeed.trim() !== '';
  const rawT = params.get('t');
  const t = rawT !== null && rawT.trim() !== '' && Number.isFinite(Number(rawT)) ? Number(rawT) : null;
  const rawPart = params.get('part');
  return {
    seed: hasSeed ? rawSeed.trim() : randomSeed(),
    hasSeed,
    bpm: positive(params.get('bpm')),
    beats: Math.max(1, Math.round(positive(params.get('beats')) ?? DEFAULT_BEATS)),
    speed: positive(params.get('speed')) ?? DEFAULT_SPEED,
    t,
    auto: params.has('auto') ? params.get('auto') !== '0' : !hasSeed,
    part: rawPart && rawPart.trim() ? rawPart.trim().toLowerCase() : null,
  };
};

/**
 * Query string for a reel look, e.g. `reelSearch({ seed: 42, part: 'a' })`
 * → `'?part=a&seed=42'`. Null/undefined values are skipped. Handy for keeping
 * the address bar in sync (`history.replaceState`) or printing share links.
 */
export const reelSearch = (values) => {
  const q = new URLSearchParams();
  for (const key of ['part', 'seed', 'bpm', 'beats', 'speed', 't', 'auto']) {
    const v = values?.[key];
    if (v === null || v === undefined || v === '') continue;
    q.set(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  const query = q.toString();
  return query ? `?${query}` : '';
};

/** Seconds per bar at `bpm` (4/4 unless `beatsPerBar` says otherwise). */
export const barSeconds = (bpm, beatsPerBar = DEFAULT_BEATS_PER_BAR) => (60 / bpm) * beatsPerBar;

/**
 * Resolve a part to seconds without touching a sketch (works in Node).
 *
 * Parts are either bar ranges or seconds:
 *   { a: { bars: [1, 8] } }        bars 1–8 inclusive, 1-based like the DAW
 *                                  ruler → start of bar 1 to end of bar 8
 *   { b: { start: 30, end: 45 } }  seconds
 * A part may carry its own `bpm` / `beatsPerBar` / `offset`.
 *
 * @param {Record<string, { bars?: [number, number], start?: number, end?: number,
 *   bpm?: number, beatsPerBar?: number, offset?: number }>} parts
 * @param {string|null} partId
 * @param {{ bpm?: number, beatsPerBar?: number, offset?: number }} [opts]
 *   bpm: the TRACK tempo (not ?bpm); offset: seconds before bar 1 (e.g. encoder delay)
 * @returns {{ start: number, end: number } | null}
 */
export const resolvePart = (parts, partId, opts = {}) => {
  if (!partId || !parts) return null;
  const part = parts[String(partId).toLowerCase()];
  if (!part) return null;
  const offset = part.offset ?? opts.offset ?? 0;
  if (Array.isArray(part.bars)) {
    const bpm = part.bpm ?? opts.bpm;
    if (!positive(bpm)) throw new Error(`reelParams: part "${partId}" uses bars but no bpm was given`);
    const bar = barSeconds(bpm, part.beatsPerBar ?? opts.beatsPerBar ?? DEFAULT_BEATS_PER_BAR);
    const [startBar, endBar] = part.bars;
    return { start: offset + (startBar - 1) * bar, end: offset + endBar * bar };
  }
  if (Number.isFinite(part.start) && Number.isFinite(part.end)) {
    return { start: offset + part.start, end: offset + part.end };
  }
  return null;
};

/**
 * Point the capture at one part: sets `p.captureRange = { start, end }`
 * (seconds) and returns it. Unknown / missing part → leaves `p.captureRange`
 * alone and returns null (capture the whole track). `opts.bpm` defaults to
 * `p.midiBpm`; `end` is clamped to the loaded song's duration.
 */
export const applyPart = (p, parts, partId, opts = {}) => {
  const range = resolvePart(parts, partId, { ...opts, bpm: opts.bpm ?? p?.midiBpm });
  if (!range) return null;
  const duration = p?.song?.duration?.();
  if (Number.isFinite(duration) && duration > 0) range.end = Math.min(range.end, duration);
  range.start = Math.max(0, Math.min(range.start, range.end));
  p.captureRange = range;
  return range;
};

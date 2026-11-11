/**
 * no4Cues — MIDI cues for #RectanglesNo4, as a pure function of song time.
 *
 * The track and MIDI are copies of #RectanglesNo3's (112 BPM, 28 bars).
 * Instead of stateful scheduleCueSet handlers, every cue set is a sorted list
 * of note-start times, and each frame asks "how many notes so far, and how
 * long since the last one?" for the current time. The same answer comes back
 * live, after a seek, on a loop, and in a capture that skips frames — so the
 * sketch keeps p.captureSeekable on.
 *
 * Each instrument gets its own visual language (ARA ledger §5), and every
 * lead note makes a visible change (§11):
 *   roll   guitar (track 3)          every riff note re-rolls the composition
 *   clav   clavinet (track 5)        each note slides some of the inner lines
 *   bass   bass (track 4)            a bend: the grid warps on every note
 *   kick   drums (track 8, pitch 36) the beat punch: frame kick + line weight
 *   snare  drums (track 8, pitch 37) a glow + colour-fringe flash
 *   wheel  filter wheeler (track 0)  colours step cell to cell
 * Hi-hats (43) and the doubled / pad tracks (1, 2, 6) are left out: too dense
 * or doubling what is already shown.
 */

export const NO4_CUES = {
  roll: { track: 3 },
  clav: { track: 5 },
  bass: { track: 4 },
  kick: { track: 8, pitches: [36] },
  snare: { track: 8, pitches: [37] },
  wheel: { track: 0 },
};

// Envelope decay rates, per second (exp(-age * rate)).
const DECAY = { bass: 5, kick: 7, snare: 6 };

/**
 * Note-start times per cue set, chords merged (one cue per tick, like
 * scheduleCueSet's non-poly mode). Works on a @tonejs/midi Midi or its JSON.
 * @returns {Record<string, number[]>}
 */
export const buildNo4Cues = (midi, spec = NO4_CUES) => {
  const out = {};
  for (const [name, { track, pitches }] of Object.entries(spec)) {
    const notes = midi?.tracks?.[track]?.notes ?? [];
    const ticks = new Set();
    const times = [];
    for (const note of notes) {
      if (pitches && !pitches.includes(note.midi)) continue;
      if (ticks.has(note.ticks)) continue;
      ticks.add(note.ticks);
      times.push(note.time);
    }
    out[name] = times.sort((a, b) => a - b);
  }
  return out;
};

/** Notes started at or before t, and seconds since the last one (Infinity if none). */
export const cueAt = (times, t) => {
  let lo = 0;
  let hi = times?.length ?? 0;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return { count: lo, age: lo > 0 ? t - times[lo - 1] : Infinity };
};

/**
 * Shader uniforms for time t. Without cues (MIDI missing) uCues is 0 and the
 * shader falls back to its BPM clock.
 */
export const no4CueUniforms = (cues, t) => {
  if (!cues) return { uCues: 0, uRoll: 0, uClav: 0, uClavAge: 1e3, uBassEnv: 0, uKick: 0, uSnare: 0, uWheel: 0 };
  const env = (name) => {
    const { age } = cueAt(cues[name], t);
    return Number.isFinite(age) ? Math.exp(-age * DECAY[name]) : 0;
  };
  const clav = cueAt(cues.clav, t);
  return {
    uCues: 1,
    uRoll: cueAt(cues.roll, t).count,
    uClav: clav.count,
    uClavAge: Number.isFinite(clav.age) ? clav.age : 1e3,
    uBassEnv: env('bass'),
    uKick: env('kick'),
    uSnare: env('snare'),
    uWheel: cueAt(cues.wheel, t).count,
  };
};

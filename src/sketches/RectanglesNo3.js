import p5 from 'p5';
import '@lib/p5.audioReact.js';
import '../lib/p5.fps.js';

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

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo3.mp3';
const midiUrl = base + 'audio/RectanglesNo3.mid';

const GRID = 16;
const COMPOSITION_COUNT = 60;
const BUILD_CUES = 33;

const MONDRIAN_COLOURS = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
  { r: 221, g: 1, b: 0 },
  { r: 34, g: 80, b: 149 },
  { r: 250, g: 201, b: 1 },
];

const sketch = (p) => {
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
  p.currentCue1 = 1;
  p.currentCue2 = 1;
  p.currentCue3 = 1;

  const show = (rectangles) => {
    p.shown = rectangles;
    p.shownColours = p.colours;
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

  p.drawRect = (rectangle, cellWidth, cellHeight) => {
    const { x, y, widthMultiplier, heightMultiplier, colourIndex } = rectangle;
    const colour = p.shownColours[colourIndex];
    p.fill(colour.r, colour.g, colour.b);
    p.rect(
      cellWidth * x - cellWidth,
      cellHeight * y - cellHeight,
      cellWidth * widthMultiplier,
      cellHeight * heightMultiplier
    );
  };

  p.setup = async () => {
    p.pixelDensity(1);
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.colorMode(p.RGB, 255);

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

    p.rectangleGrid = [];
    for (let i = 1; i <= GRID; i++) {
      for (let j = 1; j <= GRID; j++) {
        p.rectangleGrid.push({ x: i, y: j, empty: true });
      }
    }
    p.createCompositions();

    const midiData = await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = 112;
    });

    if (midiData?.tracks) {
      p.scheduleCueSet(midiData.tracks[3]?.notes ?? [], 'executeCueSet1'); // Sampler 1 - Heavy guitar
      p.scheduleCueSet(midiData.tracks[5]?.notes ?? [], 'executeCueSet2'); // Sampler 3 - Clavinet D6
      p.scheduleCueSet(midiData.tracks[0]?.notes ?? [], 'executeCueSet3'); // Synth 1 - Filter Wheeler
    }
  };

  p.draw = () => {
    p.background(255);
    p.stroke(0);
    p.strokeWeight(4);
    const cellWidth = p.width / GRID;
    const cellHeight = p.height / GRID;
    for (let i = 0; i < p.shown.length; i++) {
      p.drawRect(p.shown[i], cellWidth, cellHeight);
    }
  };

  p.executeCueSet1 = () => {
    if (p.currentCue1 <= 10) {
      p.rectangles = nextComposition();
      show(p.rectangles);
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

  p.executeCueSet2 = () => {
    if (p.currentCue2 > BUILD_CUES && p.currentCue2 <= BUILD_CUES * 5 - 6) {
      const modulo = p.currentCue2 % BUILD_CUES;
      if (modulo === 1) {
        p.rectangles = nextComposition();
        p.rectanglesToDraw = [];
        p.currentPointer = 0;
        p.rectanglesPerCue = Math.floor(p.rectangles.length / BUILD_CUES);
      }

      if (p.currentPointer < p.rectangles.length) {
        const limit = Math.min(p.rectanglesPerCue * modulo, p.rectangles.length);
        for (let i = p.currentPointer; i < limit; i++) {
          p.rectanglesToDraw.push(p.rectangles[i]);
        }
        p.currentPointer = p.rectanglesPerCue * modulo;
      }

      show([...p.rectanglesToDraw]);
    }
    p.currentCue2++;
  };

  p.executeCueSet3 = () => {
    if (p.currentCue3 > 6) {
      p.rectangles = nextComposition();
      show(p.rectangles);
    }
    p.currentCue3++;
  };

  // Called by the audio engine on loop/restart: fresh compositions and
  // cue counters so the next pass starts clean.
  p.resetAnimation = () => {
    p.colours = MONDRIAN_COLOURS;
    p.createCompositions();
    p.currentComposition = 0;
    p.shown = [];
    p.shownColours = MONDRIAN_COLOURS;
    p.currentPointer = 0;
    p.rectanglesPerCue = 0;
    p.rectanglesToDraw = [];
    p.currentCue1 = 1;
    p.currentCue2 = 1;
    p.currentCue3 = 1;
  };

  p.mouseClicked = () => {
    p.togglePlayback();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

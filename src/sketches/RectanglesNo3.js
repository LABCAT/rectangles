import p5 from 'p5';
import '@lib/p5.audioReact.js';
import '../lib/p5.fps.js';

const base = import.meta.env.BASE_URL || './';
const audioUrl = base + 'audio/RectanglesNo3.mp3';
const midiUrl = base + 'audio/RectanglesNo3.mid';

const sketch = (p) => {
  p.loopAudio = true;

  p.gridCols = 4;
  p.gridRows = 5;
  p.totalCells = p.gridCols * p.gridRows;

  p.currentCue = 1;
  p.barStartCue = 1;
  p.cuesInBar = 11;

  // Pure p5.js cell tracking
  p.cells = [];
  p.revealedCells = [];
  p.cellColors = [];

  // Mondrian colors
  p.colors = {
    white: [245, 245, 245],
    black: [0, 0, 0],
    red: [237, 28, 36],
    blue: [0, 89, 150],
    yellow: [247, 217, 77],
  };

  p.initializeGrid = () => {
    p.cells = [];
    p.revealedCells = [];
    p.cellColors = [];

    const colorOptions = [p.colors.red, p.colors.blue, p.colors.yellow, p.colors.white];

    // Create cells with random colors
    for (let i = 0; i < p.totalCells; i++) {
      p.cells.push(i);
      p.cellColors.push(p.random(colorOptions));
    }

    // Shuffle cells for random reveal order
    p.cells = p.shuffle(p.cells);
  };

  p.setup = async () => {
    p.pixelDensity(1);
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.colorMode(p.RGB);
    p.background(0);

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

    // Initialize the grid on startup
    p.initializeGrid();

    const midiData = await p.loadSong(audioUrl, midiUrl, (data) => {
      p.midiPpq = data.header.ppq;
      p.midiBpm = 96;
    });

    if (midiData?.tracks) {
      // Rodent Lead — grid reveal driver
      p.scheduleCueSet(midiData.tracks[5]?.notes ?? [], 'onTrack5Cue');
      // Synth 1 — empty in this MIDI, kept for prototype fidelity
      p.scheduleCueSet(midiData.tracks[1]?.notes ?? [], 'onTrack1Cue');
    }
  };

  p.draw = () => {
    p.background(0);

    if (p.cells.length === 0) return;

    // Calculate cell dimensions
    const cellWidth = p.width / p.gridCols;
    const cellHeight = p.height / p.gridRows;

    // Draw grid cells
    for (let row = 0; row < p.gridRows; row++) {
      for (let col = 0; col < p.gridCols; col++) {
        const cellIndex = row * p.gridCols + col;

        // Only draw if cell is revealed
        if (p.revealedCells.includes(cellIndex)) {
          const color = p.cellColors[cellIndex];
          p.fill(color[0], color[1], color[2]);
          p.noStroke();
          p.rect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
        }
      }
    }

    // Draw grid lines
    p.stroke(0);
    p.strokeWeight(3);
    for (let i = 0; i <= p.gridCols; i++) {
      p.line(i * cellWidth, 0, i * cellWidth, p.height);
    }
    for (let i = 0; i <= p.gridRows; i++) {
      p.line(0, i * cellHeight, p.width, i * cellHeight);
    }
  };

  p.onTrack5Cue = function (note) {
    p.currentCue = note.currentCue;

    const barStartCues = [1, 13, 24, 36];

    // Only change grid at the beginning of each bar
    if (barStartCues.includes(note.currentCue)) {
      p.gridCols = Math.floor(p.random(4, 9));
      p.gridRows = Math.floor(p.random(4, 9));
      p.totalCells = p.gridCols * p.gridRows;

      // Set bar information
      p.barStartCue = note.currentCue;
      if (note.currentCue === 1 || note.currentCue === 13 || note.currentCue === 36) {
        p.cuesInBar = 11;
      } else if (note.currentCue === 24) {
        p.cuesInBar = 12;
      }

      // Initialize new grid and reveal first cell
      p.initializeGrid();
      p.revealedCells = [p.cells[0]];
    } else {
      // Reveal logic for subsequent cues
      const cuesElapsed = p.currentCue - p.barStartCue;
      const isLastCue = cuesElapsed >= p.cuesInBar - 1;

      if (isLastCue) {
        // Reveal all remaining cells
        p.revealedCells = [...p.cells];
      } else {
        // Reveal one more cell
        const cellsToReveal = cuesElapsed + 1;
        p.revealedCells = p.cells.slice(0, cellsToReveal);
      }
    }
  };

  p.onTrack1Cue = function () {
    // No-op — Synth 1 is empty in this MIDI, kept for prototype fidelity
  };

  p.mouseClicked = () => {
    p.togglePlayback();
  };

  // Called by the audio engine on loop/restart: drop all per-play state so
  // nothing lingers visibly into the next pass.
  p.resetAnimation = () => {
    p.gridCols = 4;
    p.gridRows = 5;
    p.totalCells = p.gridCols * p.gridRows;
    p.currentCue = 1;
    p.barStartCue = 1;
    p.cuesInBar = 11;
    p.initializeGrid();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

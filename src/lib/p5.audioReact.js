import 'p5/lib/addons/p5.sound';
import { Midi } from '@tonejs/midi';

/**
 * Resolves the p5 constructor (Rollup inject / globalThis / window).
 * Donuts guarded this; glyphs assumed a bare global — merged here.
 */
const P5 =
  (typeof globalThis !== 'undefined' && globalThis.p5) ||
  (typeof window !== 'undefined' && window.p5);

if (!P5) {
  console.warn('[p5.audioReact] p5 is not defined; import this module after p5 is available.');
} else {
  /**
   * Load audio file and set up MIDI synchronization
   * @param {String} audioUrl - URL to the audio file
   * @param {String} midiUrl - URL to the MIDI file
   * @param {Function} callback - Callback function receiving the MIDI result
   */
  P5.prototype.loadSong = function (audioUrl, midiUrl, callback) {
    this.song = this.loadSound(audioUrl, (sound) => {
      this.audioSampleRate = sound.sampleRate();
      this.totalAnimationFrames = Math.floor(sound.duration() * 60);
      this.loadMidi(midiUrl, callback);
    });
    this.song.onended(() => {
      this.songHasFinished = true;
      if (this.canvas) {
        this.canvas.classList.add('p5Canvas--cursor-play');
        this.canvas.classList.remove('p5Canvas--cursor-pause');
      }
      if (this.captureEnabled && this.captureInProgress) {
        this.captureInProgress = false;
        this.downloadFrames?.();
      }
    });
  };

  /**
   * Schedule MIDI cues to trigger animations
   * @param {Array} noteSet - Array of MIDI notes
   * @param {String} callbackName - Name of the callback function to execute
   * @param {Boolean} polyMode - Allow multiple notes at same time if true
   */
  P5.prototype.scheduleCueSet = function (noteSet, callbackName, polyMode = false) {
    let lastTicks = -1;
    let currentCue = 1;
    for (let i = 0; i < noteSet.length; i++) {
      const note = noteSet[i];
      const { ticks, time } = note;
      if (ticks !== lastTicks || polyMode) {
        note.currentCue = currentCue;
        this.song.addCue(time, this[callbackName], note);
        lastTicks = ticks;
        currentCue++;
      }
    }
  };

  /**
   * Load MIDI file and execute a callback with the result
   * @param {String} midiUrl - URL to the MIDI file
   * @param {Function} callback - Callback function receiving the MIDI result
   */
  P5.prototype.loadMidi = function (midiUrl, callback) {
    Midi.fromUrl(midiUrl).then((result) => {
      console.log('MIDI loaded:', result);
      callback(result);
      this.hideLoader();
    });
  };

  /**
   * Hide loader and show play icon (null-safe DOM; from donuts).
   */
  P5.prototype.hideLoader = function () {
    const loader = document.getElementById('loader');
    const playIcon = document.getElementById('play-icon');
    if (loader) loader.classList.add('loading--complete');
    if (playIcon) playIcon.classList.add('fade-in');
    this.audioLoaded = true;
  };

  /**
   * Toggle audio playback (play/pause)
   */
  P5.prototype.togglePlayback = function () {
    if (this.audioLoaded) {
      if (this.captureEnabled) {
        this.startCapture();
        return;
      }
      if (this.song.isPlaying()) {
        this.song.pause();
        this.canvas.classList.add('p5Canvas--cursor-play');
        this.canvas.classList.remove('p5Canvas--cursor-pause');
      } else {
        if (
          parseInt(this.song.currentTime(), 10) >=
          parseInt(this.song.buffer.duration, 10)
        ) {
          this.resetAnimation?.();
        }
        const playIcon = document.getElementById('play-icon');
        if (playIcon) playIcon.classList.remove('fade-in');
        this.song.play();
        this.showingStatic = false;
        this.canvas.classList.add('p5Canvas--cursor-pause');
        this.canvas.classList.remove('p5Canvas--cursor-play');
      }
    }
  };

  /**
   * Save sketch as PNG with timestamp on Ctrl+S
   */
  P5.prototype.saveSketchImage = function () {
    if (this.keyIsDown(this.CONTROL) && this.key === 's') {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      this.save(`sketch_${timestamp}.png`);
      return false;
    }
  };
}

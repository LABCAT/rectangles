import p5 from 'p5';
import { Midi } from '@tonejs/midi';

const prevGlobalP5 = globalThis.p5;
globalThis.p5 = p5;
await import('p5.sound');
if (prevGlobalP5 === undefined) {
  delete globalThis.p5;
} else {
  globalThis.p5 = prevGlobalP5;
}

p5.prototype.loadSong = function (audioUrl, midiUrl, callback) {
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

p5.prototype.scheduleCueSet = function (noteSet, callbackName, polyMode = false) {
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

p5.prototype.loadMidi = function (midiUrl, callback) {
  Midi.fromUrl(midiUrl).then((result) => {
    console.log('MIDI loaded:', result);
    callback(result);
    this.hideLoader();
  });
};

p5.prototype.hideLoader = function () {
  const loader = document.getElementById('loader');
  const playIcon = document.getElementById('play-icon');
  if (loader) loader.classList.add('loading--complete');
  if (playIcon) playIcon.classList.add('fade-in');
  this.audioLoaded = true;
};

p5.prototype.togglePlayback = function () {
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

p5.prototype.saveSketchImage = function () {
  if (this.keyIsDown(this.CONTROL) && this.key === 's') {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    this.save(`sketch_${timestamp}.png`);
    return false;
  }
};

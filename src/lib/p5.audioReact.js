import p5 from 'p5';
import dom from 'p5/dom';
import { Midi } from '@tonejs/midi';

dom(p5);

p5.prototype.loadSong = async function (audioUrl, midiUrl, callback) {
  try {
    await new Promise((resolve, reject) => {
      this.song = this.createAudio(audioUrl, () => resolve());
      this.song.elt.addEventListener(
        'error',
        () => reject(new Error(`Failed to load audio: ${audioUrl}`)),
        { once: true }
      );
    });
    this.song.hide();
    this.audioSampleRate = 44100;
    this.totalAnimationFrames = Math.floor((this.song.duration() || 0) * 60);

    this.song.elt.onended = () => {
      this.songHasFinished = true;
      if (this.canvas) {
        this.canvas.classList.add('p5Canvas--cursor-play');
        this.canvas.classList.remove('p5Canvas--cursor-pause');
      }
      if (this.captureEnabled && this.captureInProgress) {
        this.captureInProgress = false;
        this.downloadFrames?.();
      }
    };

    const midiData = await this.loadMidi(midiUrl);
    callback?.(midiData);
    this.hideLoader();
    return midiData;
  } catch (error) {
    console.error('Failed to load song or MIDI:', error);
    this.hideLoader();
    return null;
  }
};

p5.prototype.scheduleCueSet = function (noteSet, callbackName, polyMode = false) {
  const fn = this[callbackName];
  if (typeof fn !== 'function') {
    console.error(`scheduleCueSet: missing handler "${callbackName}"`);
    return;
  }
  let lastTicks = -1;
  let currentCue = 1;
  for (let i = 0; i < noteSet.length; i++) {
    const note = noteSet[i];
    const { ticks, time } = note;
    if (ticks !== lastTicks || polyMode) {
      note.currentCue = currentCue;
      const cueTime = time <= 0 ? 1e-6 : time;
      this.song.addCue(cueTime, (val) => fn.call(this, val), note);
      lastTicks = ticks;
      currentCue++;
    }
  }
};

p5.prototype.loadMidi = async function (midiUrl) {
  const result = await Midi.fromUrl(midiUrl);
  console.log('MIDI loaded:', result);
  return result;
};

p5.prototype.hideLoader = function () {
  const loader = document.getElementById('loader');
  const playIcon = document.getElementById('play-icon');
  if (loader) loader.classList.add('loading--complete');
  if (playIcon) playIcon.classList.add('fade-in');
  this.audioLoaded = true;
};

p5.prototype.togglePlayback = function () {
  if (this.audioLoaded && this.song) {
    if (this.captureEnabled) {
      this.startCapture();
      return;
    }
    const el = this.song.elt;
    if (!el.paused) {
      this.song.pause();
      this.canvas.classList.add('p5Canvas--cursor-play');
      this.canvas.classList.remove('p5Canvas--cursor-pause');
    } else {
      const currentTime = this.song.time();
      const duration = this.song.duration();
      if (currentTime >= duration && duration > 0) {
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

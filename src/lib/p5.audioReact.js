import './p5.soundBoot.js';
import p5 from 'p5';
import { Midi } from '@tonejs/midi';

p5.prototype.getSongPlaybackTime = function () {
  if (!this.song) return NaN;
  if (
    this.captureInProgress &&
    typeof this.audioSampleRate === 'number' &&
    this.audioSampleRate > 0 &&
    typeof this.song._lastPos === 'number'
  ) {
    const t = this.song._lastPos / this.audioSampleRate;
    if (Number.isFinite(t)) return t;
  }
  if (this.song.isPlaying()) {
    if (this._playbackWallStartPerf == null) return 0;
    const rate = this.song.speed ?? 1;
    return (
      this._playbackSongSecondsAtWallStart +
      ((performance.now() - this._playbackWallStartPerf) / 1000) * rate
    );
  }
  return Number.isFinite(this._playbackFrozenSec) ? this._playbackFrozenSec : 0;
};

p5.prototype._stopMidiCuePoll = function () {
  if (this._midiCuePollId != null) {
    clearInterval(this._midiCuePollId);
    this._midiCuePollId = null;
  }
};

p5.prototype._reindexMidiCues = function (fromSeconds) {
  const sorted = [...(this._midiTransportCues || [])].sort((a, b) => a.time - b.time);
  const t0 = Math.max(0, fromSeconds);
  let i = 0;
  while (i < sorted.length && sorted[i].time < t0 - 1e-4) {
    i++;
  }
  this._midiCueSorted = sorted;
  this._midiCueNext = i;
};

p5.prototype._midiCuePollTick = function () {
  if (!this.song?.isPlaying()) return;
  const t = this.getSongPlaybackTime();
  if (!Number.isFinite(t)) return;
  const cues = this._midiCueSorted;
  if (!cues?.length) return;
  const slack = 0.03;
  while (this._midiCueNext < cues.length && cues[this._midiCueNext].time <= t + slack) {
    const { fn, note } = cues[this._midiCueNext];
    this._midiCueNext++;
    fn.call(this, note);
  }
};

p5.prototype.loadSong = async function (audioUrl, midiUrl, callback) {
  try {
    const sound = await this.loadSound(audioUrl);
    this.song = sound;
    this._midiTransportCues = [];
    this._midiCueSorted = [];
    this._midiCueNext = 0;
    this._stopMidiCuePoll();
    this.song._cues = [];

    this.audioSampleRate = sound.sampleRate?.() ?? 44100;
    this.totalAnimationFrames = Math.floor((sound.duration() || 0) * 60);

    sound.onended(() => {
      this.songHasFinished = true;
      this._stopMidiCuePoll();
      this._playbackWallStartPerf = null;
      const dur = this.song.duration?.() ?? 0;
      this._playbackFrozenSec = Number.isFinite(dur) ? dur : 0;
      if (this.canvas) {
        this.canvas.classList.add('p5Canvas--cursor-play');
        this.canvas.classList.remove('p5Canvas--cursor-pause');
      }
      if (this.captureEnabled && this.captureInProgress) {
        this.captureInProgress = false;
        this.downloadFrames?.();
      }
    });

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
  if (!this.song?._cues) {
    this.song._cues = [];
  }
  if (!this._midiTransportCues) {
    this._midiTransportCues = [];
  }
  let lastTicks = -1;
  let currentCue = 1;
  for (let i = 0; i < noteSet.length; i++) {
    const note = noteSet[i];
    const { ticks, time } = note;
    if (ticks !== lastTicks || polyMode) {
      note.currentCue = currentCue;
      const cueTime = time <= 0 ? 1e-6 : time;
      this.song._cues.push({ time: cueTime, callback: fn, val: note, scope: this });
      this._midiTransportCues.push({ time: cueTime, fn, note });
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
    if (this.song.isPlaying()) {
      if (this._playbackWallStartPerf != null) {
        const rate = this.song.speed ?? 1;
        this._playbackFrozenSec =
          this._playbackSongSecondsAtWallStart +
          ((performance.now() - this._playbackWallStartPerf) / 1000) * rate;
      }
      this._playbackWallStartPerf = null;
      this._stopMidiCuePoll();
      this.song.pause();
      this.canvas.classList.add('p5Canvas--cursor-play');
      this.canvas.classList.remove('p5Canvas--cursor-pause');
    } else {
      const duration = this.song.duration();
      let fromSec = Math.max(0, this.getSongPlaybackTime() || 0);
      if (Number.isFinite(fromSec) && Number.isFinite(duration) && fromSec >= duration && duration > 0) {
        this.resetAnimation?.();
        this.song.jump(0);
        this._playbackFrozenSec = 0;
        fromSec = 0;
      }
      const playIcon = document.getElementById('play-icon');
      if (playIcon) playIcon.classList.remove('fade-in');

      const startPlayback = () => {
        this._playbackWallStartPerf = performance.now();
        this._playbackSongSecondsAtWallStart = fromSec;
        this._reindexMidiCues(fromSec);
        this._stopMidiCuePoll();
        this.userStartAudio();
        this.song.play();
        this._midiCuePollId = setInterval(() => this._midiCuePollTick(), 20);
        this._midiCuePollTick();
        this.showingStatic = false;
        this.canvas.classList.add('p5Canvas--cursor-pause');
        this.canvas.classList.remove('p5Canvas--cursor-play');
      };

      startPlayback();
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

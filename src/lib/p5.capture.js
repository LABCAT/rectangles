import JSZip from 'jszip';

/** Keep each ZIP small enough for `Blob` construction and RAM (full-window PNGs add up fast). */
const DEFAULT_MAX_FRAMES_PER_ZIP = 250;

/** Pause between each ZIP download so browsers do not block later saves (Chrome often drops many back-to-back downloads). */
const MS_BETWEEN_ZIP_DOWNLOADS = 900;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function initCapture(p, options = {}) {
  const isOptionsObject = options && typeof options === 'object' && !Array.isArray(options);
  const prefix = isOptionsObject ? options.prefix ?? options.captureFilePrefix : options;
  const enabled = isOptionsObject ? !!options.enabled : options !== undefined ? true : p.captureEnabled ?? false;
  const captureCSSBackground = isOptionsObject ? !!options.captureCSSBackground : false;
  const maxFramesPerZip =
    isOptionsObject && Number.isFinite(options.maxFramesPerZipPart) && options.maxFramesPerZipPart > 0
      ? Math.floor(options.maxFramesPerZipPart)
      : DEFAULT_MAX_FRAMES_PER_ZIP;

  p.captureFilePrefix = prefix || p.captureFilePrefix || 'capture';
  p.captureEnabled = enabled;
  p.captureCSSBackground = captureCSSBackground;
  p.captureMaxFramesPerZipPart = maxFramesPerZip;

  p.capturedFrames = [];
  p.frameNumber = 0;
  p.captureInProgress = false;

  p.captureFrame = async () => {
    const canvasElt = p.canvas?.elt ?? p.canvas;
    const frameNum = p.frameNumber++;

    if (p.captureCSSBackground) {
      return p.captureFrameWithBackground(canvasElt, frameNum);
    }

    return new Promise((resolve) => {
      canvasElt.toBlob((blob) => {
        if (blob) {
          p.capturedFrames.push({
            blob,
            frameNumber: frameNum,
            filename: `${p.captureFilePrefix}_${p.nf(frameNum, 5)}.png`
          });
        }
        resolve();
      }, 'image/png');
    });
  };

  p.startCapture = () => {
    if (p.captureInProgress || !p.captureEnabled) return;
    p.capture().catch((error) => {
      console.error('Capture failed:', error);
      p.captureInProgress = false;
    });
  };

  const getDecodedChannel0 = (song) => {
    if (!song) return null;
    const web = song.buffer?.getChannelData?.(0);
    if (web?.length) return web;
    const tone = song.soundfile?.buffer?.getChannelData?.(0);
    if (tone?.length) return tone;
    return null;
  };

  const waveformFromBuffer = (song, bins = 1024) => {
    if (typeof song?._lastPos !== 'number') return null;
    const ch = getDecodedChannel0(song);
    if (!ch?.length) return null;
    const endSample = Math.floor(song._lastPos);
    const start = Math.max(0, endSample - bins);
    const out = [];
    for (let i = 0; i < bins; i++) {
      const idx = start + i;
      out.push(idx < ch.length ? ch[idx] : 0);
    }
    return out;
  };

  p.capture = async () => {
    p.captureInProgress = true;
    p.capturedFrames = [];
    p.frameNumber = 0;
    p.zipPartNumber = 1;
    p.captureTimestamp = Date.now();

    const durFromSound = Number(p.song?.duration?.() ?? 0);
    const durFromBuffer = Number(p.song?.soundfile?.buffer?.duration ?? 0);
    const durSec = Math.max(durFromSound, durFromBuffer, 0);
    const framesFromAudio = Math.max(1, Math.floor(durSec * 60));
    if (framesFromAudio !== p.totalAnimationFrames) {
      console.warn(
        `[capture] totalAnimationFrames ${p.totalAnimationFrames} → ${framesFromAudio} (audio ${durSec.toFixed(3)}s @ 60fps)`
      );
    }
    p.totalAnimationFrames = framesFromAudio;

    const cues = p.song._cues.slice().sort((a, b) => a.time - b.time);
    let cueIndex = 0;

    p.song._lastPos = 0;

    const hasFFT = p.fft && typeof p.fft.waveform === 'function';
    const originalWaveform = hasFFT ? p.fft.waveform.bind(p.fft) : null;

    if (hasFFT) {
      p.fft.waveform = (bins, mode) => {
        const b = typeof bins === 'number' ? bins : 1024;
        const arr = waveformFromBuffer(p.song, b);
        return arr ? arr.slice() : originalWaveform.call(p.fft, bins, mode);
      };
    }

    try {
      for (let frame = 0; frame < p.totalAnimationFrames; frame++) {
        console.log(`Capturing frame ${frame + 1} / ${p.totalAnimationFrames}`);
        const frameTime = frame / 60;

        p.song._lastPos = Math.max(0, frameTime * p.audioSampleRate);

        while (cueIndex < cues.length && cues[cueIndex].time <= frameTime) {
          const cue = cues[cueIndex];
          cue.callback.call(cue.scope || p, cue.val);
          cueIndex++;
        }

        p.draw();

        await p.captureFrame();

        if (p.capturedFrames.length >= p.captureMaxFramesPerZipPart) {
          await p.downloadFramesPart();
        }
      }

      if (p.capturedFrames.length > 0) {
        await p.downloadFramesPart();
      }
    } finally {
      if (hasFFT && originalWaveform) p.fft.waveform = originalWaveform;
      p.captureInProgress = false;
    }

    console.log(`Capture complete. Downloaded ${p.frameNumber} frames.`);
  };

  p.downloadFramesPart = async () => {
    if (p.capturedFrames.length === 0) {
      return;
    }

    console.log(`Creating ZIP part ${p.zipPartNumber} with ${p.capturedFrames.length} frames...`);
    
    p.capturedFrames.sort((a, b) => a.frameNumber - b.frameNumber);
    
    const zip = new JSZip();
    
    for (let i = 0; i < p.capturedFrames.length; i++) {
      const frame = p.capturedFrames[i];
      zip.file(frame.filename, frame.blob, { binary: true });
      
      if ((i + 1) % 100 === 0) {
        console.log(`Added ${i + 1} / ${p.capturedFrames.length} frames to part ${p.zipPartNumber}...`);
      }
      frame.blob = null;
    }

    const prefix = p.captureFilePrefix;
    const ffmpegCommandLines = [
      `# 1) Allow multiple downloads for this site in your browser — otherwise you may only get the first few ZIPs.`,
      `# 2) cd into the folder that contains the PNGs (same folder as this file).`,
      `# 3) Unzip EVERY part into that folder so you have ${prefix}_00000.png, ${prefix}_00001.png, … with no gaps.`,
      `#    If ffmpeg says "index in the range 0-4" it cannot see ${prefix}_00000.png — wrong folder or a missing first zip part.`,
      `# 4) If your sequence truly starts at e.g. 2500, add -start_number 2500 before -i (match the first file's number).`,
      `#    ffmpeg -framerate 60 -start_number 2500 -i '${prefix}_%05d.png' ...`,
      ``,
      `# ProRes 422 HQ — bash / macOS / Linux / Windows PowerShell (run from the PNG folder):`,
      `ffmpeg -framerate 60 -i '${prefix}_%05d.png' -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le ${prefix}_prores422hq.mov`,
      ``,
      `# ProRes 4444 (10-bit + alpha, very large) — same shells:`,
      `ffmpeg -framerate 60 -i '${prefix}_%05d.png' -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le ${prefix}_prores4444.mov`,
      ``,
      `# Windows CMD.exe: prefer PowerShell above. If you use a .bat file, write %%05d so CMD passes %05d to ffmpeg:`,
      `ffmpeg -framerate 60 -i ${prefix}_%%05d.png -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le ${prefix}_prores422hq.mov`,
    ].join('\n');
    zip.file('ffmpeg_command.txt', ffmpegCommandLines);

    console.log(`Generating ZIP part ${p.zipPartNumber}...`);

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
      streamFiles: true,
    });
    
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${p.captureFilePrefix}_frames_part${p.zipPartNumber}_${p.captureTimestamp}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);

    console.log(`Downloaded ZIP part ${p.zipPartNumber}`);
    await sleep(MS_BETWEEN_ZIP_DOWNLOADS);

    p.capturedFrames = [];
    p.zipPartNumber++;
  };

  p.gradientToPng = (cssValue, width, height, blendMode = '') => {
    return new Promise((resolve) => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml"
                 style="width:${width}px;height:${height}px;background: ${cssValue}; ${blendMode ? `background-blend-mode: ${blendMode};` : ''}">
            </div>
          </foreignObject>
        </svg>
      `;
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.src = url;
    });
  };

  p.captureFrameWithBackground = async (canvasElt, frameNum) => {
    const root = document.documentElement;
    const computed = getComputedStyle(canvasElt);
    const canvasBg = computed.getPropertyValue('--canvas-complex-bg').trim();
    const gradientBg = (canvasBg && canvasBg !== 'none') ? canvasBg : getComputedStyle(root).getPropertyValue('--gradient-bg').trim();
    const blendMode = computed.getPropertyValue('--canvas-complex-blend-mode').trim() || getComputedStyle(root).getPropertyValue('--gradient-blend-mode').trim();
    
    const width = canvasElt.width;
    const height = canvasElt.height;

    const gradientCanvas = await p.gradientToPng(gradientBg, width, height, blendMode);
    
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = width;
    compositeCanvas.height = height;
    const ctx = compositeCanvas.getContext('2d');
    
    ctx.drawImage(gradientCanvas, 0, 0);
    ctx.drawImage(canvasElt, 0, 0);

    return new Promise((resolve) => {
      compositeCanvas.toBlob((blob) => {
        if (blob) {
          p.capturedFrames.push({
            blob,
            frameNumber: frameNum,
            filename: `${p.captureFilePrefix}_${p.nf(frameNum, 5)}.png`
          });
        }
        resolve();
      }, 'image/png');
    });
  };

  if (p.captureEnabled) {
    p.noLoop();
  }

  return p;
}

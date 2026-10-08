import p5 from 'p5';

/**
 * FPS indicator for audio-reactive sketches.
 *
 * Provides p.enableFpsIndicator / p.disableFpsIndicator / p.toggleFpsIndicator
 * and a DOM badge (default bottom-right, `position: 'bottom-left'` supported).
 * Reuses the shared lab-label styling when present, with a JS-injected
 * fallback when that stylesheet is absent.
 *
 * Usage:
 *   import '@lib/p5.fps.js';
 *   // in setup():
 *   p.enableFpsIndicator({ position: 'bottom-left' });
 *   // options: { elementId, updateInterval, decimals, autoCreate, position }
 */

const STYLE_ID = 'lab-label-fallback-style';
const DEFAULT_ID = 'fps-indicator';
const POSITIONS = ['top-right', 'bottom-right', 'bottom-left', 'top-left'];

function ensureFallbackStyle() {
  if (document.getElementById(STYLE_ID)) return;
  // Only inject if .lab-label not already styled (best-effort detection)
  // We inject anyway as low-specificity fallback; real lab styles win via cascade order.
  const css = `
.lab-label{position:fixed;z-index:1000;padding:8px 12px;background:var(--black,#000);font-family:'Orbitron',monospace;font-weight:700;color:var(--white,#fff);pointer-events:none;line-height:1;font-size:14px}
.lab-label--top-right{top:10px;right:10px}
.lab-label--bottom-right{bottom:10px;right:10px}
.lab-label--bottom-left{bottom:10px;left:10px}
.lab-label--top-left{top:10px;left:10px}
.lab-label--fps{min-width:4.5em;text-align:right;font-variant-numeric:tabular-nums}
.lab-label[hidden]{display:none !important}
`;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = css;
  document.head.appendChild(tag);
}

function applyPositionClass(el, position) {
  const pos = POSITIONS.includes(position) ? position : 'bottom-right';
  for (const q of POSITIONS) el.classList.remove(`lab-label--${q}`);
  el.classList.add(`lab-label--${pos}`);
}

function resolveElement(elementId, autoCreate, position) {
  let el = document.getElementById(elementId);
  if (!el && autoCreate) {
    ensureFallbackStyle();
    el = document.createElement('div');
    el.id = elementId;
    el.className = 'lab-label lab-label--fps';
    applyPositionClass(el, position);
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

p5.prototype._fpsIndicatorEl = null;
p5.prototype._fpsIntervalId = null;
p5.prototype._fpsUpdate = null;

/**
 * Enable and start updating the FPS badge.
 * @param {object} [opts]
 * @param {string} [opts.elementId='fps-indicator']
 * @param {boolean} [opts.autoCreate=true] - create the div if missing
 * @param {number} [opts.updateInterval=250] - ms between DOM updates
 * @param {number} [opts.decimals=0] - decimal places
 * @param {string} [opts.position='bottom-right'] - badge corner
 */
p5.prototype.enableFpsIndicator = function (opts = {}) {
  const {
    elementId = DEFAULT_ID,
    autoCreate = true,
    updateInterval = 250,
    decimals = 0,
    position = 'bottom-right',
  } = opts;

  const el = resolveElement(elementId, autoCreate, position);
  if (!el) {
    console.warn(`enableFpsIndicator: #${elementId} not found and autoCreate disabled`);
    return;
  }
  // Ensure correct classes if element pre-existed but lacked styling
  if (!el.classList.contains('lab-label')) {
    el.classList.add('lab-label', 'lab-label--fps');
  }
  applyPositionClass(el, position);
  el.hidden = false;
  this._fpsIndicatorEl = el;

  // Clear any previous interval
  this.disableFpsIndicator();

  // measured FPS via deltaTime (p5.getFrameRate() in p5 v2 returns _targetFrameRate, not actual)
  this._fpsSmoothed = null;
  this._fpsWindow = this._fpsWindow || [];
  if (!this._fpsDrawWrapped && typeof this.draw === 'function') {
    const orig = this.draw;
    const self = this;
    this._fpsOrigDraw = orig;
    this._fpsDrawWrapped = true;
    this.draw = function (...args) {
      const now = performance.now();
      self._fpsWindow.push(now);
      if (self._fpsWindow.length > 60) self._fpsWindow.shift();
      return orig.apply(self, args);
    };
  }
  const update = () => {
    if (!this._fpsIndicatorEl) return;
    if (this.captureInProgress) {
      this._fpsIndicatorEl.hidden = true;
      return;
    }
    this._fpsIndicatorEl.hidden = false;
    let fps = 0;
    const dt = this.deltaTime;
    if (typeof dt === 'number' && dt > 0 && dt < 1000) {
      const instant = 1000 / dt;
      if (this._fpsSmoothed == null) this._fpsSmoothed = instant;
      else this._fpsSmoothed = this._fpsSmoothed * 0.8 + instant * 0.2;
      fps = this._fpsSmoothed;
    } else if (this._fpsWindow && this._fpsWindow.length >= 2) {
      const span = this._fpsWindow[this._fpsWindow.length - 1] - this._fpsWindow[0];
      if (span > 0) fps = (this._fpsWindow.length - 1) * 1000 / span;
    }
    const text = Number.isFinite(fps) && fps > 0 ? `${fps.toFixed(decimals)} FPS` : '-- FPS';
    this._fpsIndicatorEl.textContent = text;
  };

  this._fpsUpdate = update;
  update();
  this._fpsIntervalId = setInterval(update, updateInterval);
};

/**
 * Stop updating (leaves element hidden state as-is; caller may hide).
 */
p5.prototype.disableFpsIndicator = function () {
  if (this._fpsIntervalId != null) {
    clearInterval(this._fpsIntervalId);
    this._fpsIntervalId = null;
  }
};

/**
 * Manual tick — useful if you prefer to call from draw() instead of interval.
 * No-op when not enabled.
 */
p5.prototype.updateFpsIndicator = function () {
  if (typeof this._fpsUpdate === 'function') this._fpsUpdate();
};

/**
 * Convenience toggle.
 */
p5.prototype.toggleFpsIndicator = function (opts) {
  if (this._fpsIntervalId != null) {
    this.disableFpsIndicator();
    if (this._fpsIndicatorEl) this._fpsIndicatorEl.hidden = true;
  } else {
    this.enableFpsIndicator(opts);
  }
};

// Aliases for brevity
p5.prototype.showFps = p5.prototype.enableFpsIndicator;
p5.prototype.hideFps = function () {
  this.disableFpsIndicator();
  if (this._fpsIndicatorEl) this._fpsIndicatorEl.hidden = true;
};

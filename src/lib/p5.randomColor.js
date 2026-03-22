/**
 * @fileoverview p5.randomColor.js
 * A p5-aware port of randomColor (original by David Merfield, CC0)
 * This module augments p5.prototype with `randomColor(options)` which
 * mirrors the original API but uses p5's RNG and returns a p5.Color.
 */
const colorDictionary = {};
const colorRanges = [];

loadColorBounds();

/**
 * Generates a random color using p5's RNG
 * @param {Object} options - Configuration options
 * @param {string|number} [options.hue] - Hue range (color name or 0-360)
 * @param {string} [options.luminosity] - "bright", "light", "dark", or "random"
 * @param {number} [options.alpha] - Alpha value (0-1)
 * @param {number} [options.count] - Number of colors to generate
 * @returns {p5.Color|p5.Color[]} A p5.Color or array of p5.Colors
 */
p5.prototype.randomColor = function (options) {
  const p = this;
  options = options || {};

  function generateOne() {
    const H = pickHueForP(p, options);
    const S = pickSaturation(H, options, p);
    const B = pickBrightness(H, S, options, p);
    return colorFromHSV([H, S, B], options, p);
  }

  if (options.count !== null && options.count !== undefined) {
    const totalColors = options.count;
    const colors = [];
    for (let i = 0; i < totalColors; i++) colorRanges.push(false);
    const singleOptions = { ...options };
    delete singleOptions.count;
    while (colors.length < totalColors) colors.push(p.randomColor(singleOptions));
    return colors;
  }

  return generateOne();
};

/**
 * Picks a hue value based on options
 * @param {p5} p - p5 instance
 * @param {Object} options - Options object
 * @returns {number} Hue value (0-360)
 * @private
 */
function pickHueForP(p, options) {
  if (colorRanges.length > 0) {
    let hueRange = getRealHueRange(options.hue);
    let hue = p.random(hueRange[0], hueRange[1]);

    const step = (hueRange[1] - hueRange[0]) / colorRanges.length;
    let j = parseInt((hue - hueRange[0]) / step);

    if (colorRanges[j] === true) {
      j = (j + 2) % colorRanges.length;
    } else {
      colorRanges[j] = true;
    }

    const min = (hueRange[0] + j * step) % 359;
    const max = (hueRange[0] + (j + 1) * step) % 359;
    hueRange = [min, max];

    hue = p.random(hueRange[0], hueRange[1]);
    if (hue < 0) hue = 360 + hue;
    return hue;
  } else {
    const hueRange = getHueRange(options.hue);
    let hue = p.random(hueRange[0], hueRange[1]);
    if (hue < 0) hue = 360 + hue;
    return hue;
  }
}

/**
 * Picks a saturation value based on hue and options
 * @param {number} hue - Hue value
 * @param {Object} options - Options object
 * @param {p5} p - p5 instance
 * @returns {number} Saturation value (0-100)
 * @private
 */
function pickSaturation(hue, options, p) {
  if (options && options.hue === "monochrome") return 0;
  if (options && options.luminosity === "random") return p.random(0, 100);

  const saturationRange = getSaturationRange(hue);
  let sMin = saturationRange[0], sMax = saturationRange[1];

  switch (options && options.luminosity) {
    case "bright":
      sMin = 55;
      break;
    case "dark":
      sMin = sMax - 10;
      break;
    case "light":
      sMax = 55;
      break;
  }

  return p.random(sMin, sMax);
}

/**
 * Picks a brightness value based on hue, saturation, and options
 * @param {number} H - Hue value
 * @param {number} S - Saturation value
 * @param {Object} options - Options object
 * @param {p5} p - p5 instance
 * @returns {number} Brightness value (0-100)
 * @private
 */
function pickBrightness(H, S, options, p) {
  let bMin = getMinimumBrightness(H, S), bMax = 100;
  switch (options && options.luminosity) {
    case "dark":
      bMax = bMin + 20;
      break;
    case "light":
      bMin = (bMax + bMin) / 2;
      break;
    case "random":
      bMin = 0;
      bMax = 100;
      break;
  }
  return p.random(bMin, bMax);
}

/**
 * Creates a p5.Color from HSB values
 * @param {number[]} hsv - Array of [H, S, B] values
 * @param {Object} options - Options object
 * @param {p5} p - p5 instance
 * @returns {p5.Color} p5.Color object
 * @private
 */
function colorFromHSV(hsv, options, p) {
  options = options || {};
  const H = hsv[0];
  const S = hsv[1];
  const B = hsv[2];
  const alpha = options.alpha === undefined ? 1 : Math.max(0, Math.min(1, options.alpha));
  p.push();
  p.colorMode(p.HSB, 360, 100, 100, 1);
  const c = p.color(H, S, B, alpha);
  p.pop();
  return c;
}

/**
 * Calculates minimum brightness for a given hue and saturation
 * @param {number} H - Hue value
 * @param {number} S - Saturation value
 * @returns {number} Minimum brightness value
 * @private
 */
function getMinimumBrightness(H, S) {
  const lowerBounds = getColorInfo(H).lowerBounds;
  for (let i = 0; i < lowerBounds.length - 1; i++) {
    const s1 = lowerBounds[i][0], v1 = lowerBounds[i][1];
    const s2 = lowerBounds[i + 1][0], v2 = lowerBounds[i + 1][1];
    if (S >= s1 && S <= s2) {
      const m = (v2 - v1) / (s2 - s1), b = v1 - m * s1;
      return m * S + b;
    }
  }
  return 0;
}

/**
 * Gets hue range for a color input
 * @param {string|number} colorInput - Color name or hue value
 * @returns {number[]} Array of [min, max] hue range
 * @private
 */
function getHueRange(colorInput) {
  if (!isNaN(parseInt(colorInput))) {
    const number = parseInt(colorInput);
    if (number < 360 && number > 0) return [number, number];
  }
  if (typeof colorInput === "string") {
    if (colorDictionary[colorInput]) {
      const color = colorDictionary[colorInput];
      if (color.hueRange) return color.hueRange;
    }
  }
  return [0, 360];
}

/**
 * Gets saturation range for a hue value
 * @param {number} hue - Hue value
 * @returns {number[]} Array of [min, max] saturation range
 * @private
 */
function getSaturationRange(hue) {
  return getColorInfo(hue).saturationRange;
}

/**
 * Gets color information for a hue value
 * @param {number} hue - Hue value
 * @returns {Object} Color info with hueRange, lowerBounds, saturationRange, brightnessRange
 * @private
 */
function getColorInfo(hue) {
  if (hue >= 334 && hue <= 360) hue -= 360;
  for (const colorName in colorDictionary) {
    const color = colorDictionary[colorName];
    if (
      color.hueRange &&
      hue >= color.hueRange[0] &&
      hue <= color.hueRange[1]
    ) {
      return colorDictionary[colorName];
    }
  }
  return { lowerBounds: [[0,0]], saturationRange: [0,100] };
}

/**
 * Defines a color in the color dictionary
 * @param {string} name - Color name
 * @param {number[]|null} hueRange - Hue range array or null
 * @param {number[][]} lowerBounds - Array of [saturation, brightness] pairs
 * @private
 */
function defineColor(name, hueRange, lowerBounds) {
  const sMin = lowerBounds[0][0], sMax = lowerBounds[lowerBounds.length - 1][0];
  const bMin = lowerBounds[lowerBounds.length - 1][1], bMax = lowerBounds[0][1];
  colorDictionary[name] = {
    hueRange: hueRange,
    lowerBounds: lowerBounds,
    saturationRange: [sMin, sMax],
    brightnessRange: [bMin, bMax],
  };
}

/**
 * Loads color bounds into the color dictionary
 * @private
 */
function loadColorBounds() {
  defineColor("monochrome", null, [ [0,0], [100,0] ]);

  defineColor("red", [-26, 18], [
    [20,100],[30,92],[40,89],[50,85],[60,78],[70,70],[80,60],[90,55],[100,50]
  ]);

  defineColor("orange", [18,46], [
    [20,100],[30,93],[40,88],[50,86],[60,85],[70,70],[100,70]
  ]);

  defineColor("yellow", [46,62], [
    [25,100],[40,94],[50,89],[60,86],[70,84],[80,82],[90,80],[100,75]
  ]);

  defineColor("green", [62,178], [
    [30,100],[40,90],[50,85],[60,81],[70,74],[80,64],[90,50],[100,40]
  ]);

  defineColor("blue", [178,257], [
    [20,100],[30,86],[40,80],[50,74],[60,60],[70,52],[80,44],[90,39],[100,35]
  ]);

  defineColor("purple", [257,282], [
    [20,100],[30,87],[40,79],[50,70],[60,65],[70,59],[80,52],[90,45],[100,42]
  ]);

  defineColor("pink", [282,334], [
    [20,100],[30,90],[40,86],[60,84],[80,80],[90,75],[100,73]
  ]);
}

/**
 * Gets the real hue range when generating multiple colors
 * @param {string|number} colorHue - Color name or hue value
 * @returns {number[]} Array of [min, max] hue range
 * @private
 */
function getRealHueRange(colorHue) {
  if (!isNaN(colorHue)) {
    const number = parseInt(colorHue);
    if (number < 360 && number > 0) return getColorInfo(colorHue).hueRange;
  } else if (typeof colorHue === 'string') {
    if (colorDictionary[colorHue]) {
      const color = colorDictionary[colorHue];
      if (color.hueRange) return color.hueRange;
    }
  }
  return [0,360];
}

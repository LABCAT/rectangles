/**
 * RectanglesNo2 background: a neon blob sky with a rectangle tunnel of light
 * running through it (a GPU fragment shader).
 *
 * Techniques from cosmic-couch (github.com/KartikManral/cosmic-couch, MIT),
 * made rectangular:
 *   - the sky is its page plasma: four sine fields, one a circular blob that
 *     drifts around, mapped through a four-colour neon set (one colour dark,
 *     for depth), saturated, under a dark radial veil. Soft floating blobs;
 *   - each background hit moves to the next colour set;
 *   - an endless tunnel by maths over the sky: depth z = k / radius + travel
 *     with a BOX radius, so it's the screen's shape. Its walls are a grid of
 *     TUBES in (angle, depth), cel-shaded: each tube lit like a cylinder,
 *     snapped to three flat bands with a highlight, inside a dark ink
 *     outline. The tiles between are open, so the blobs show everywhere,
 *     and the tubes thicken towards the lens with the perspective;
 *   - part B (uScene 1) is another world: its "temple" kaleidoscope made
 *     rectangular — space mirrored in x, y and the diagonal (no angular
 *     fold, so no octagons), repeated four times over, glowing neon
 *     rectangle outlines (box distances throughout) rippling inward on a
 *     black void;
 *   - part A (uWindow 1) is a wall of rectangular windows over all that:
 *     they pop open with the beat onto the full-bright sky, the wall between
 *     them dim;
 *   - tone map col / (1 + col·k) so glows don't clip, and a vignette.
 *
 * Drawn with p5's filter shader into a half-res WEBGL graphics; a pure
 * function of the uniforms (song time, beat, hits), so capture is
 * reproducible.
 */

export const NO2_TUNNEL_FRAG = `
precision highp float;
varying vec2 vTexCoord;
uniform vec2 uRes;
uniform float uT;
uniform float uBeat;
uniform float uSpeed;
uniform float uCells;
uniform vec3 uP0;
uniform vec3 uP1;
uniform vec3 uP2;
uniform vec3 uP3;
uniform float uTunnel;
uniform float uFlash;
uniform float uPunch;
uniform float uDim;
uniform float uScene;
uniform float uReveal;
uniform float uWindow;
uniform float uRimFlash;
uniform float uMel;
uniform float uMelProg;
uniform float uMelShape;
uniform float uMelTilt;
uniform vec3 uMelCol;

const float TAU = 6.28318;
const float TUBE_R = 0.05; // tube radius, in tile units
const float INK = 1.2;     // ink outline reaches this far (in tube radii)

// Screen-space width of a value's change, for antialiasing (no derivatives
// extension needed: estimated from the tile size on screen).
float fwidthApprox(float v) { return 0.012; }

// Four-colour neon set, looped: v in 0–1 wraps p0 → p1 → p2 → p3 → p0.
vec3 neon(float v) {
  v = fract(v) * 4.0;
  float k = fract(v);
  if (v < 1.0) return mix(uP0, uP1, k);
  if (v < 2.0) return mix(uP1, uP2, k);
  if (v < 3.0) return mix(uP2, uP3, k);
  return mix(uP3, uP0, k);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Part B: the rectangle kaleidoscope (glowing outlines on black).
// Rectangles only: every fold is a mirror in x, y or the diagonal, and every
// distance is a box distance, so each outline is a square-cornered rectangle.
vec3 kaleido(vec2 uv) {
  uv *= rot(uBeat * 0.06);
  // Box radius from the centre, stepped so each band is itself a square.
  float rb = max(abs(uv.x), abs(uv.y));
  float band = floor(rb * 4.0) / 4.0;
  // Mirror fold: 4 quadrants, then the diagonal (8 mirrored pieces, all square).
  uv = abs(uv);
  if (uv.y > uv.x) uv = uv.yx;
  uv *= 1.15 + 0.25 * sin(uBeat * 0.11) + 0.12 * uPunch;
  vec3 col = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float i = float(k);
    uv = fract(uv * 1.5) - 0.5;
    float d = max(abs(uv.x), abs(uv.y)) * exp(-band * 1.1);
    vec3 c = neon(band * 0.6 + i * 0.25 + uT * 0.08);
    d = sin(d * 8.0 + uBeat * 0.9) / 8.0;
    d = max(abs(d), 1e-4);
    d = pow(0.011 / d, 1.25);
    col += c * d;
  }
  col *= 0.8 + 0.5 * uPunch;
  return col / (1.0 + col * 0.3);
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 q = vTexCoord;
  vec2 uv = (q - 0.5) * vec2(asp, 1.0);

  // --- Sky: the floating-blob plasma.
  float t = uT * 1.05 + uPunch * 0.15;
  float u = q.x * 6.0;
  float v = q.y * 4.0;
  float s = sin(u + t) + sin(v * 1.3 - t * 0.7) + sin((u + v) * 0.8 + t * 0.5)
    + sin(length(vec2(u - 3.0 + sin(t * 0.3) * 2.0, v - 2.0)) * 2.2 - t);
  vec3 col = neon(s / 8.0 + 0.5 + t * 0.03);
  // Saturate a touch, then the veil: darker towards one side, like a light falling across.
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(grey), col, 1.25);
  float veil = smoothstep(0.0, 0.9, length((q - vec2(0.3, 0.6)) * vec2(asp, 1.0)));
  col *= 1.0 - 0.45 * veil;

  // --- Tunnel of light: box radius (1 at the screen's edge), endless depth.
  float rb = max(abs(uv.x) / (0.5 * asp), abs(uv.y) / 0.5) + 1e-3;
  float z = 0.55 / rb + uBeat * uSpeed;
  float a = atan(uv.y, uv.x) / TAU;
  vec2 w = vec2(a * uCells, z);
  vec2 g = abs(fract(w) - 0.5);
  // Distance from the nearest grid line, in tile units.
  float d = min(0.5 - g.x, 0.5 - g.y);
  // Cel-shaded tube: x across its width (0 at the centre, 1 at its skin),
  // lit as a cylinder (nz), snapped to three bands, a highlight on top, an
  // ink outline just outside.
  float x = d / TUBE_R;
  float aa = fwidthApprox(d) / TUBE_R;
  float body = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, x);
  float ink = (1.0 - smoothstep(INK - aa, INK + aa, x)) - body;
  float nz = sqrt(max(0.0, 1.0 - x * x));
  // Gentle bands: a soft step down to the shadow side, a light highlight.
  float band = nz > 0.82 ? 1.0 : (nz > 0.5 ? 0.82 : 0.64);
  vec3 tubeCol = neon(z * 0.06 + 0.2) * band;
  tubeCol = mix(tubeCol, vec3(1.0), step(0.96, nz) * 0.35);
  // Part of the scene: the tubes take on the sky's colour too.
  tubeCol = mix(col, tubeCol, 0.6);
  // Fade the tunnel out at the vanishing point and in at the lens.
  float depth = smoothstep(0.06, 0.4, rb) * uTunnel;
  col = mix(col, col * 0.55, ink * depth);
  col = mix(col, tubeCol, body * depth);

  // --- Part B: a hard cut to the kaleidoscope (no sky, no tunnel).
  if (uScene > 0.5) col = kaleido(uv);

  // --- A hit: the scene flares a touch.
  col *= 1.0 + 0.25 * uFlash;

  col = col / (1.0 + col * 0.25);
  col *= 1.0 - 0.22 * dot(uv, uv);

  // --- Part A: the wall of windows. The screen is a grid of rectangles (some
  // cells split in two, so the shapes vary); each opens when uReveal passes
  // its own random threshold, growing from its centre with a bounce. Open
  // windows show the sky at full brightness with a neon rim; the wall
  // between them sits at the dim level.
  vec2 n = asp >= 1.0 ? vec2(floor(5.0 * asp + 0.5), 5.0) : vec2(5.0, floor(5.0 / asp + 0.5));
  vec2 gq = q * n;
  vec2 c = floor(gq);
  vec2 f = fract(gq);
  vec2 hs = vec2(0.5);
  float r = hash(c + uCells);
  if (r < 0.3) { c.x += step(0.5, f.x) * 0.37; f.x = fract(f.x * 2.0); hs.x = 0.25; }
  else if (r < 0.6) { c.y += step(0.5, f.y) * 0.37; f.y = fract(f.y * 2.0); hs.y = 0.25; }
  float h = hash(c * 1.7 + 3.1 + uCells);
  float o = clamp((uReveal - h) / 0.04, 0.0, 1.0);
  float e = 1.0 + 2.7 * pow(o - 1.0, 3.0) + 1.7 * pow(o - 1.0, 2.0);
  vec2 dd = abs(f - 0.5) * 2.0 * hs;
  vec2 half_ = hs * 0.9 * e;
  float bd = max(dd.x - half_.x, dd.y - half_.y);
  float on = step(0.001, o) * uWindow;
  float win = (1.0 - smoothstep(-0.008, 0.008, bd)) * on;
  float rim = (1.0 - smoothstep(0.0, 0.022, abs(bd))) * on;
  col *= mix(1.0 - uDim, 1.0, win);
  // Each snare snaps the rims white (and a touch wider), fading back to neon.
  float rimW = (1.0 - smoothstep(0.0, 0.022 + 0.02 * uRimFlash, abs(bd))) * on;
  col += mix(neon(h + uT * 0.05) * 0.45, vec3(1.6), uRimFlash) * mix(rim, rimW, uRimFlash);

  // --- Parts D, E: the melody. Each note is a nest of glowing neon
  // rectangles bursting out from the centre over the note, white-hot on the
  // line, with the scene dimmed under it. The pitch shapes the rectangle:
  // tall slot (low) to wide letterbox (high).
  if (uMel > 0.001) {
    vec2 m = abs(rot(uMelTilt) * uv) / (vec2(0.5 * asp, 0.5) * mix(vec2(0.5, 1.0), vec2(1.0, 0.5), uMelShape));
    float bm = max(m.x, m.y);
    float grow = 0.3 + 0.85 * (1.0 - pow(1.0 - uMelProg, 3.0));
    vec3 glow = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float dr = abs(bm - grow * (1.0 - fk * 0.21));
      float gl = pow(0.014 / max(dr, 1e-3), 1.2) / (1.0 + fk * 0.9);
      glow += mix(uMelCol, vec3(1.0), 0.85 * (1.0 - smoothstep(0.0, 0.02, dr))) * gl;
    }
    col = col * (1.0 - 0.55 * uMel) + min(glow, vec3(2.0)) * uMel;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

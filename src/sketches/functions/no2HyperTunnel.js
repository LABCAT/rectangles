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
 *     rectangular — space folded into 8 mirrored segments, repeated four
 *     times over, glowing neon rectangle outlines (a box distance where it
 *     used a circle) rippling inward on a black void;
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

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Part B: the rectangle kaleidoscope (glowing outlines on black).
vec3 kaleido(vec2 uv) {
  vec2 uv0 = uv;
  uv *= rot(uBeat * 0.06);
  float seg = TAU / 8.0;
  float a = mod(atan(uv.y, uv.x), seg);
  a = abs(a - seg * 0.5);
  float r = length(uv);
  uv = vec2(cos(a), sin(a)) * r;
  uv *= 1.15 + 0.25 * sin(uBeat * 0.11) + 0.12 * uPunch;
  vec3 col = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float i = float(k);
    uv = fract(uv * 1.5) - 0.5;
    float d = max(abs(uv.x), abs(uv.y)) * exp(-length(uv0) * 1.1);
    vec3 c = neon(length(uv0) * 0.6 + i * 0.25 + uT * 0.08);
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
  col *= 1.0 - uDim;
  gl_FragColor = vec4(col, 1.0);
}
`;

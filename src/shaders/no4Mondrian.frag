// #RectanglesNo4 — psychedelic Mondrian.
//
// A Mondrian composition is a split tree: the frame splits into two cells
// along one black line, each cell splits again, and so on. Here the tree is
// evaluated per pixel from hashes, so it costs a handful of hashes per level
// and never needs a CPU pass. On top of the classic picture (paper, black
// lines, red / yellow / blue blocks):
//   - lines slide to new positions on the beat (inner levels every uStep
//     beats, the top line every uTopBeats), the whole structure re-rolls
//     every 2 × uTopBeats beats, and with uBuild the tree grows one level per
//     beat and resets on the bar
//   - colours rotate cell to cell (uCycleBeats) and the accent hues spin
//     (uHueSpin), op-art square rings run through some cells (uRings)
//   - folds (mirror / quad / kaleidoscope), a 45° lozenge (Mondrian's own
//     diamond canvases), domain warp and chromatic aberration
//   - portal depth: a window in each composition holds the next one, and
//     the camera zooms into it forever (Droste), uZoom windows per bar
//
// Every value is a pure function of uTime (seconds) and the look's uniforms,
// so frame N is always the same image (capture can skip frames).
precision highp float;

#define TAU 6.28318530718
#define MAX_DEPTH 6
#define PORTAL_LEVELS 3

uniform vec2 uRes;          // canvas size, px
uniform float uTime;        // seconds (capture: frame / 60)
uniform float uBpm;         // motion tempo
uniform float uLoop;        // loop length, seconds (uBeats beats)
uniform float uFade;        // 0..1 brightness (auto-look dips)
uniform float uEnergy;      // section energy (provisional parts)
uniform float uLevel;       // 0..1 audio level (generic, small)

uniform float uBeats;
uniform float uSeedSalt;
uniform float uDepthMin;    // split tree: always split this deep
uniform float uDepthMax;    // never deeper than this
uniform float uDensity;     // chance a cell past uDepthMin keeps splitting
uniform float uQuant;       // 0 free, else lines snap to a uQuant × uQuant grid
uniform float uLine;        // line width, frame-height units (height = 2)
uniform float uFill;        // share of cells painted
uniform float uDark;        // share of cells painted the dark colour
uniform float uFold;        // 0 none, 2 mirror, 4 quad, 6/8 kaleidoscope
uniform float uSpin;        // kaleidoscope turns per loop
uniform float uTilt;        // canvas rotation (π/4 = lozenge)
uniform float uZoom;        // portal: windows zoomed per bar (0 = flat)
uniform float uWindow;      // portal: window = frame / uWindow
uniform float uCenterX;     // portal window centre, share of the frame
uniform float uCenterY;
uniform float uWarp;
uniform float uWarpFreq;
uniform float uWarpCycles;  // warp drift cycles per loop
uniform float uCycleBeats;  // colours step cell to cell every N beats (0 off)
uniform float uHueSpin;     // accent hue turns per loop
uniform float uRings;       // share of painted cells with op-art rings
uniform float uStep;        // beats between inner line moves
uniform float uTopBeats;    // beats between top line moves
uniform float uBuild;       // 1: one level per beat, reset on the bar
uniform float uSnap;        // line move length, beats
uniform float uPump;        // beat punch
uniform float uAberr;       // chromatic aberration
uniform float uGlow;        // line glow (neon / ink light)
uniform float uShade;       // darken deeper portal levels
uniform float uAudio;       // how much uLevel shows

uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uDarkCol;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;

// Per-frame values shared by every sample.
float gBeat;
float gEpoch;
float gEnv;
float gLineK;
float gDepth;
float gHueA;
float gZoomFrac;
float gZoomIndex;
float gZoomMag;

// Dave Hoskins' hash without sine: stable across GPUs.
vec4 hash43(vec3 p) {
  vec4 p4 = fract(vec4(p.xyzx) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Hue rotation around the grey axis (keeps lightness roughly).
vec3 hueRot(vec3 c, float a) {
  vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

vec3 accent(float i) {
  i = mod(i, 3.0);
  vec3 c = i < 0.5 ? uColA : (i < 1.5 ? uColB : uColC);
  return clamp(hueRot(c, gHueA), 0.0, 1.0);
}

// Mild back-out ease: lines snap past their mark and settle.
float snapEase(float x) {
  float s = 1.2;
  float y = x - 1.0;
  return 1.0 + (s + 1.0) * y * y * y + s * y * y;
}

// Where a cell's line sits (lo..hi along its axis) for move m.
float splitAt(float id, float salt, float m, float lo, float hi, float ext) {
  float f = 0.25 + 0.5 * hash43(vec3(id * 1.618 + 0.3, salt + m * 13.0, gEpoch * 3.0 + 1.0)).x;
  float c = mix(lo, hi, f);
  if (uQuant > 0.5) {
    // Snap to one grid across the whole frame so lines line up between cells.
    float g = 2.0 * ext / uQuant;
    c = -ext + floor((c + ext) / g + 0.5) * g;
    c = clamp(c, lo + g, hi - g);
  }
  return c;
}

// One composition (index n) at p. Returns the signed distance to the nearest
// black line (negative inside it) and, through out params, the leaf cell.
float compose(vec2 p, vec2 box, float n, out vec2 lo, out vec2 hi, out float id) {
  lo = -box;
  hi = box;
  id = 1.0;
  float salt = uSeedSalt + n * 37.0;
  float w = 0.5 * uLine * gLineK;
  // The frame itself has a line (it shows round portal windows).
  vec2 edge = min(p - lo, hi - p);
  float sd = min(edge.x, edge.y) - w;
  for (int i = 0; i < MAX_DEPTH; i++) {
    float lv = float(i);
    if (lv >= gDepth) break;
    vec4 h = hash43(vec3(id, salt, gEpoch));
    if (lv >= uDepthMin && h.x > uDensity) break;
    vec2 size = hi - lo;
    // Split the long side mostly, so cells stay Mondrian-ish, not slivers.
    bool alongX = size.x > size.y;
    if (h.y < 0.25) alongX = !alongX;
    float a0 = alongX ? lo.x : lo.y;
    float a1 = alongX ? hi.x : hi.y;
    float ext = alongX ? box.x : box.y;
    if (a1 - a0 < (uQuant > 0.5 ? 4.0 * ext / uQuant : 0.14)) break;
    // Line moves: the top line every uTopBeats, inner lines every uStep.
    float period = lv < 0.5 ? uTopBeats : uStep;
    float k = gBeat / period;
    float m = floor(k);
    float ph = clamp((k - m) * period / uSnap, 0.0, 1.0);
    float from = splitAt(id, salt, m - 1.0, a0, a1, ext);
    float to = splitAt(id, salt, m, a0, a1, ext);
    float c = clamp(mix(from, to, snapEase(ph)), a0 + w, a1 - w);
    float pa = alongX ? p.x : p.y;
    float lw = lv < 0.5 ? w * 1.35 : w;
    sd = min(sd, abs(pa - c) - lw);
    if (pa < c) {
      if (alongX) hi.x = c; else hi.y = c;
      id = id * 2.0;
    } else {
      if (alongX) lo.x = c; else lo.y = c;
      id = id * 2.0 + 1.0;
    }
  }
  return sd;
}

// The picture at screen position uv (height = 2).
vec3 scene(vec2 uv) {
  float aspect = uRes.x / uRes.y;
  vec2 box = vec2(aspect, 1.0);

  // Beat punch: the frame kicks toward the viewer.
  uv *= 1.0 - 0.045 * uPump * uEnergy * gEnv;

  if (uTilt != 0.0) {
    uv = rot(uv, uTilt);
    box = vec2((aspect + 1.0) * 0.70711);
  }

  if (uFold > 5.0) {
    float seg = TAU / uFold;
    float a = atan(uv.y, uv.x) + TAU * uSpin * uTime / uLoop;
    a = mod(a, seg);
    a = abs(a - 0.5 * seg);
    uv = length(uv) * vec2(cos(a), sin(a));
    box = vec2(length(vec2(aspect, 1.0)));
  } else if (uFold > 3.0) {
    uv = abs(uv);
  } else if (uFold > 1.0) {
    uv.x = abs(uv.x);
  }

  if (uWarp > 0.0) {
    float wph = TAU * uWarpCycles * uTime / uLoop;
    float amt = 0.05 * uWarp * uEnergy * (1.0 + uAudio * uLevel);
    uv += amt * vec2(sin(uv.y * uWarpFreq + wph), sin(uv.x * uWarpFreq * 1.3 - wph));
  }

  // Portal: zoom about the window's fixed point, then step into windows.
  vec2 p = uv;
  float n = 0.0;
  float mag = 1.0; // screen units per composition unit
  float depth = 0.0;
  float frameSd = 1e5;
  if (uZoom > 0.0) {
    vec2 c = vec2(uCenterX, uCenterY) * box;
    vec2 fix = c * uWindow / (uWindow - 1.0);
    p = fix + (uv - fix) / gZoomMag;
    mag = gZoomMag;
    n = gZoomIndex;
    vec2 wh = box / uWindow;
    for (int i = 0; i < PORTAL_LEVELS; i++) {
      vec2 q = p - c;
      if (abs(q.x) < wh.x && abs(q.y) < wh.y) {
        p = q * uWindow;
        n += 1.0;
        mag /= uWindow;
        depth += 1.0;
      } else {
        break;
      }
    }
    vec2 d = abs(p - c) - wh;
    frameSd = max(d.x, d.y) - 0.5 * uLine * gLineK * 1.35;
  }

  vec2 lo;
  vec2 hi;
  float id;
  float sd = compose(p, box, n, lo, hi, id);
  sd = min(sd, frameSd);

  // Leaf colour: paper, an accent, or the dark colour.
  vec4 hl = hash43(vec3(id * 1.37 + 0.5, uSeedSalt + n * 37.0 + 11.0, gEpoch));
  float cyc = uCycleBeats > 0.0 ? floor(gBeat / uCycleBeats) : 0.0;
  vec3 col = uPaper;
  if (hl.x < uFill) {
    float idx = floor(hl.y * 3.0) + cyc;
    col = accent(idx);
    if (hl.w < uRings) {
      // Op-art: square rings from the cell edge inward, marching on the beat.
      vec2 mid = 0.5 * (lo + hi);
      vec2 halfSize = 0.5 * (hi - lo);
      vec2 q = abs(p - mid);
      float e = min(halfSize.x - q.x, halfSize.y - q.y);
      float r = fract(e * 9.0 - gBeat * 0.5);
      col = mix(col, accent(idx + 1.0), step(0.5, r));
    }
  } else if (hl.z < uDark) {
    col = uDarkCol;
  }

  // Lines, anti-aliased to one screen pixel at this zoom.
  float aa = 2.0 / uRes.y / mag;
  float ink = 1.0 - smoothstep(-aa, aa, sd);
  col = mix(col, uInk, ink);

  if (uGlow > 0.0) {
    float g = exp(-max(sd, 0.0) / (0.025 / mag + 1e-4));
    col += uInk * uGlow * 0.55 * g * (0.55 + 0.45 * gEnv + uAudio * uLevel) * (1.0 - ink);
  }

  if (uShade > 0.0) col *= 1.0 - uShade * max(0.0, depth - gZoomFrac);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.0;

  gBeat = uTime * uBpm / 60.0;
  gEpoch = floor(gBeat / (2.0 * uTopBeats));
  gEnv = exp(-fract(gBeat) * 5.0);
  gLineK = 1.0 + 0.9 * uPump * uEnergy * gEnv + 0.4 * uAudio * uLevel;
  gDepth = uBuild > 0.5 ? min(uDepthMax, uDepthMin + floor(mod(gBeat, 4.0))) : uDepthMax;
  gHueA = TAU * uHueSpin * uTime / uLoop;
  float zp = uTime * uZoom * uBpm / 240.0;
  gZoomIndex = floor(zp);
  gZoomFrac = zp - gZoomIndex;
  gZoomMag = pow(uWindow, gZoomFrac);

  vec3 col;
  if (uAberr > 0.0) {
    vec2 off = uv * uAberr * (1.0 + gEnv);
    col = vec3(scene(uv + off).r, scene(uv).g, scene(uv - off).b);
  } else {
    col = scene(uv);
  }
  gl_FragColor = vec4(col * uFade, 1.0);
}

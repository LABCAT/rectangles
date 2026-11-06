// Pass-through: p5 draws plane(width, height), which fills the canvas with
// the default camera. All the work happens per pixel in no4Mondrian.frag.
attribute vec3 aPosition;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}

function applyEmissiveGlow(p, c) {
  p.noStroke();
  p.shininess(100);
  p.ambientMaterial(p.red(c) * 0.12, p.green(c) * 0.12, p.blue(c) * 0.12);
  p.specularMaterial(255, 245, 255);
  p.emissiveMaterial(p.red(c) * 0.92, p.green(c) * 0.92, p.blue(c) * 0.92);
  p.fill(c);
}

export function drawRectTubeFrame(p, w, h, tubeR, c) {
  const hw = w / 2 - tubeR;
  const hh = h / 2 - tubeR;
  const spanX = w - 2 * tubeR;
  const spanY = h - 2 * tubeR;
  applyEmissiveGlow(p, c);

  p.push();
  p.translate(0, -h / 2 + tubeR, 0);
  p.rotateZ(p.HALF_PI);
  p.cylinder(tubeR, spanX);
  p.pop();

  p.push();
  p.translate(0, h / 2 - tubeR, 0);
  p.rotateZ(p.HALF_PI);
  p.cylinder(tubeR, spanX);
  p.pop();

  p.push();
  p.translate(-w / 2 + tubeR, 0, 0);
  p.cylinder(tubeR, spanY);
  p.pop();

  p.push();
  p.translate(w / 2 - tubeR, 0, 0);
  p.cylinder(tubeR, spanY);
  p.pop();

  applyEmissiveGlow(p, c);
  const corners = [
    [-hw, -hh, 0],
    [hw, -hh, 0],
    [-hw, hh, 0],
    [hw, hh, 0],
  ];
  for (const [x, y, z] of corners) {
    p.push();
    p.translate(x, y, z);
    p.sphere(tubeR, 12, 8);
    p.pop();
  }
}

import p5 from 'p5';

const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.canvas.style.position = 'relative';
    p.canvas.style.zIndex = '1';
    document.getElementById('loader')?.classList.add('loading--complete');
  };

  p.draw = () => {
    p.background(0);
    p.rectMode(p.CENTER);
    p.fill(255);
    p.noStroke();
    p.rect(p.width / 2, p.height / 2, 120, 80);
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };
};

new p5(sketch);

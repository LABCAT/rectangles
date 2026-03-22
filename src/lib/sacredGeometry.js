// Sacred Geometry Library
// Shared functions for drawing sacred geometry patterns using p5.Polar
/**
 * Draws the vesica piscis pattern
 * @param {string} currentShapeType - Current shape type being used
 * @param {number} size - Size of the pattern
 */
p5.prototype.drawVesicaPiscis = function(currentShapeType, size) {
  if (currentShapeType === 'polarEllipse') {
    this.polarEllipse(0, size, size);
    this.polarEllipse(0, size / 2, size /2);
    this.polarEllipse(0, size / 4 * 3, size / 4 * 3, size / 4);
    this.polarEllipse(0, size / 4 * 3, size / 4 * 3, -size / 4);
  } else {
    this[currentShapeType](0, size);
    this[currentShapeType](0, size / 2);
    this[currentShapeType](0, size / 4 * 3, -size / 4);
    this[currentShapeType](180, size / 4 * 3, -size / 4);
  }
};

/**
 * Draws the seed of life pattern
 * @param {string} currentShapeType - Current shape type being used
 * @param {number} size - Size of the pattern
 */
p5.prototype.drawSeedOfLife = function(currentShapeType, size) {
  const shapeSize = size / 2;
  if (currentShapeType === 'polarEllipse') {
    this.polarEllipse(0, shapeSize, shapeSize);
    this.polarEllipses(6, shapeSize, shapeSize, shapeSize);
  }
  else {
    this[currentShapeType](0, shapeSize);
    this[`${currentShapeType}s`](6, shapeSize, shapeSize);
  }
};

/**
 * Draws the egg of life pattern
 * @param {string} currentShapeType - Current shape type being used
 * @param {number} size - Size of the pattern
 */
p5.prototype.drawEggOfLife = function(currentShapeType, size) {
  const shapeSize = size / 3;
  if (currentShapeType === 'polarEllipse') {
    this.polarEllipse(0, shapeSize, shapeSize);
    this.polarEllipses(6, shapeSize, shapeSize, shapeSize * 2);
  }
  else {
    this[currentShapeType](0, shapeSize);
    this[`${currentShapeType}s`](6, shapeSize, shapeSize * 2);
  }
};

/**
 * Draws the flower of life pattern
 * @param {string} currentShapeType - Current shape type being used
 * @param {number} size - Size of the pattern
 */
p5.prototype.drawFlowerOfLife = function(currentShapeType, size) {
  const shapeSize = size / 3;
  if (currentShapeType === 'polarEllipse') {
    this.polarEllipse(0, size, size);
    this.polarEllipse(0, shapeSize, shapeSize);
    this.polarEllipses(6, shapeSize, shapeSize, shapeSize);
    this.polarEllipses(12, shapeSize, shapeSize, shapeSize * 2);
  }
  else {
    this[currentShapeType](0, size);
    this[currentShapeType](0, shapeSize);
    this[`${currentShapeType}s`](6, shapeSize, shapeSize);
    this[`${currentShapeType}s`](12, shapeSize, shapeSize * 2);
  }
};

/**
 * Draws the fruit of life pattern
 * @param {string} currentShapeType - Current shape type being used
 * @param {number} size - Size of the pattern
 */
p5.prototype.drawFruitOfLife = function(currentShapeType, size) {
  const shapeSize = size / 5;
  if (currentShapeType === 'polarEllipse') {
    this.polarEllipse(0, shapeSize, shapeSize);
    this.polarEllipses(6, shapeSize, shapeSize, shapeSize * 2);
    this.polarEllipses(6, shapeSize, shapeSize, shapeSize * 4);
  }
  else {
    this[currentShapeType](0, shapeSize);
    this[`${currentShapeType}s`](6, shapeSize, shapeSize * 2);
    this[`${currentShapeType}s`](6, shapeSize, shapeSize * 4);
  }
};

/**
 * Draws Metatrons Cube pattern
 * @param {string} currentShapeType - Current shape type being used
 * @param {number} size - Size of the pattern
 */
p5.prototype.drawMetatronsCube = function(currentShapeType, size) {
  const shapeSize = size / 5;
  if (currentShapeType === 'polarEllipse') {
    this.polarEllipse(0, shapeSize, shapeSize);
    this.polarEllipses(6, shapeSize, shapeSize, shapeSize * 2);
    this.polarEllipses(6, shapeSize, shapeSize, shapeSize * 4);
  }
  else {
    this[currentShapeType](0, shapeSize);
    this[`${currentShapeType}s`](6, shapeSize, shapeSize * 2);
    this[`${currentShapeType}s`](6, shapeSize, shapeSize * 4);
  }

  const originalStrokeWeight = this.drawingContext.lineWidth;
  this.strokeWeight(originalStrokeWeight / 4);

  const linePositions = [];
  for (let i = 0; i < 6; i++) {
    const angle = this.TWO_PI / 6 * i + this.PI / 6;
    linePositions.push({
      x: this.cos(angle) * shapeSize * 2,
      y: this.sin(angle) * shapeSize * 2
    });
    linePositions.push({
      x: this.cos(angle) * shapeSize * 4,
      y: this.sin(angle) * shapeSize * 4
    });
  }

  for (let i = 0; i < linePositions.length; i++) {
    for (let j = i + 1; j < linePositions.length; j++) {
      this.line(linePositions[i].x, linePositions[i].y, linePositions[j].x, linePositions[j].y);
    }
  }
  this.strokeWeight(originalStrokeWeight);
};

/**
 * Draws the tree of life pattern
 * @param {string} currentShapeType - Current shape type being used
 * @param {number} size - Size of the pattern
 */
p5.prototype.drawTreeOfLife = function(currentShapeType, size) {
  const shapeSize = size / 2;
  const points = [];
  
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 + 30) * Math.PI / 180;
    const x = Math.cos(angle) * shapeSize;
    const y = Math.sin(angle) * shapeSize - shapeSize;
    points.push({x, y});
  }
  
  for (let i = 0; i < 6; i++) {
    if (i === 0 || i === 2) continue; 
    const angle = (i * 60 + 30) * Math.PI / 180;
    const x = Math.cos(angle) * shapeSize;
    const y = Math.sin(angle) * shapeSize + shapeSize;
    points.push({x, y});
  }
  
  points.push({x: 0, y: shapeSize});

  points.forEach((point, index) => {
    this.push();
    this.translate(point.x, point.y);
    if (currentShapeType === 'polarEllipse') {
      this.polarEllipse(0, shapeSize / 3, shapeSize / 3);
    } else {
      this[currentShapeType](0, shapeSize / 3);
    }
    this.pop();
  });

  const connections = [
    // Top triangle (Supernal Triad)
    [3, 4], [4, 5], [5, 3],
    // Vertical paths from top triangle
    [5, 0], [3, 2],
    // Connections to bottom ring
    [0, 9], [2, 7],
    // Horizontal connections
    [0, 2],
    // Vertical central trunk
    [4, 8], [8, 10], [10, 6],
    // Bottom formation connections
    [7, 8], [8, 9], [9, 10], [10, 7]
  ];
  
  connections.forEach(([from, to]) => {
    if (points[from] && points[to]) {
      this.line(points[from].x, points[from].y, points[to].x, points[to].y);
    }
  });
  
};
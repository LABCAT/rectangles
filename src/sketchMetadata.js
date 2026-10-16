export const sketchMetadata = {
  'number-1': {
    title: '#RectanglesNo1',
    description: 'A centered rectangle.',
    sketch: 'RectanglesNo1.js',
  },
  'number-2': {
    title: '#RectanglesNo2',
    description: 'WebGL torus.',
    sketch: 'RectanglesNo2.js',
  },
  'number-3': {
    title: '#RectanglesNo3',
    description: 'Mondrian grid reveal.',
    sketch: 'RectanglesNo3.js',
  },
};

export function getAllSketches() {
  return Object.keys(sketchMetadata).map(id => ({
    id,
    ...sketchMetadata[id],
  }));
}

export function getSketchById(id) {
  return sketchMetadata[id] || null;
}

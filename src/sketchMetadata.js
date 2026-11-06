export const sketchMetadata = {
  'number-1': {
    title: '#RectanglesNo1',
    description: 'A centered rectangle.',
    sketch: 'RectanglesNo1.js',
    // Prev/next in the control panel walk the reel parts (a, b).
    trackNav: true,
  },
  'number-2': {
    title: '#RectanglesNo2',
    description: 'WebGL torus.',
    sketch: 'RectanglesNo2.js',
  },
  'number-3': {
    title: '#RectanglesNo3',
    description: 'Piet Mondrian grid (2021)',
    sketch: 'RectanglesNo3.js',
  },
  'number-4': {
    title: '#RectanglesNo4',
    description: 'Psychedelic WebGL Mondrian (work in progress)',
    sketch: 'RectanglesNo4.js',
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

export const sketchMetadata = {
  'number-1': {
    title: '#RectanglesNo1',
    description: 'A centered rectangle.',
    sketch: 'RectanglesNo1.js',
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

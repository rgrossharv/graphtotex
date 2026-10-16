import { complexColor, prepareComplex, type ComplexView } from './complexMath';

self.onmessage = (event: MessageEvent<{ input: string; view: ComplexView; size: number }>) => {
  try {
    const { input, view, size } = event.data;
    const { evaluate } = prepareComplex(input);
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const value = evaluate(view.real + ((x + 0.5) / size * 2 - 1) * view.radius, view.imaginary + (1 - (y + 0.5) / size * 2) * view.radius);
      const rgb = complexColor(value), offset = (y * size + x) * 4;
      pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2]; pixels[offset + 3] = 255;
    }
    self.postMessage({ pixels: pixels.buffer, size }, { transfer: [pixels.buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'The function could not be plotted.' }); }
};

import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  stdin: {
    contents: `export { generateTikzExport } from './src/lib/tikzExport';
      export { generateTikzExport3D } from './src/lib/tikzExport3d';
      export { prepareMath } from './src/lib/mathParser';
      export { prepareMath3D } from './src/lib/mathParser3d';`,
    resolveDir: process.cwd()
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  packages: 'external'
});
const source = outputFiles[0].text.replace(/from "(mathjs|katex)"/g, (_, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const { generateTikzExport, generateTikzExport3D, prepareMath, prepareMath3D } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const style = { visible: true, color: '#0f766e', lineWidth: 1.25, dashed: false, samples: 50 };
const viewport = { xMin: -2, xMax: 2, yMin: -2, yMax: 2 };
const input2D = {
  expressions: [{ ...style, rawInput: 'x^2', domainMin: '', domainMax: '', ...prepareMath('x^2') }],
  viewport,
  settings: { showGrid: true, showAxes: true, showTicks: true }
};
const input3D = {
  expressions: [{ ...style, rawInput: 'x+y', domainXMin: '', domainXMax: '', domainYMin: '', domainYMax: '', ...prepareMath3D('x+y') }],
  viewport: { ...viewport, zMin: -4, zMax: 4, yaw: 0.8, pitch: -0.5, distance: 15 },
  settings: { showGrid: true, showAxes: true, showBox: true }
};
const units2D = (code) => {
  const match = code.match(/scale=([\d.]+), x=([\d.]+)cm, y=([\d.]+)cm/);
  assert.ok(match, 'explicit unit lengths and overall scale are exported');
  return match.slice(1).map(Number);
};
const body2D = (code) => code.slice(code.indexOf('\\clip'));
const body3D = (code) => code.slice(code.indexOf('% Surface'));

test('2D custom scales squeeze x independently while retaining coordinates and bounds', () => {
  const original = generateTikzExport(input2D);
  const squeezed = generateTikzExport({ ...input2D, axisScales: { x: 0.5, y: 1 } });
  const [, xUnit, yUnit] = units2D(squeezed);
  assert.equal(xUnit / yUnit, 0.5);
  assert.equal(body2D(squeezed), body2D(original));
  assert.match(squeezed, /\\clip \(-2,-2\) rectangle \(2,2\);/);
});

test('2D custom ratios refer to axis units even when x and y ranges differ', () => {
  const unequal = { ...input2D, viewport: { ...viewport, xMin: -5, xMax: 5 } };
  const code = generateTikzExport({ ...unequal, aspectRatio: 16 / 9, axisScales: { x: 0.5, y: 1.25 } });
  const [, xUnit, yUnit] = units2D(code);
  assert.equal(xUnit / yUnit, 0.4);
  assert.equal((10 * xUnit) / (4 * yUnit), 1);
  assert.match(code, /\\clip \(-5,-2\) rectangle \(5,2\);/);
});

test('overall 2D scale remains independent of custom units and shape presets still work', () => {
  const options = { ...input2D, axisScales: { x: 0.25, y: 2 } };
  const small = generateTikzExport({ ...options, scale: 1 });
  const large = generateTikzExport({ ...options, scale: 2 });
  assert.deepEqual(units2D(small), [1, 0.25, 2]);
  assert.deepEqual(units2D(large), [2, 0.25, 2]);
  assert.equal(body2D(small), body2D(large));
  assert.deepEqual(units2D(generateTikzExport({ ...input2D, aspectRatio: 16 / 9 })), [1.2, 1, 0.5625]);
});

test('3D custom ratios override equal axes without changing the camera, bounds, or surface', () => {
  const original = generateTikzExport3D(input3D);
  const code = generateTikzExport3D({ ...input3D, axisScales: { x: 0.5, y: 1, z: 2 } });
  assert.match(code, /unit vector ratio\*=0\.5 1 2,/);
  assert.doesNotMatch(code, /axis equal image/);
  assert.equal(code.match(/view=\{[^}]+\}\{[^}]+\}/)[0], original.match(/view=\{[^}]+\}\{[^}]+\}/)[0]);
  for (const bounds of ['xmin=-2, xmax=2,', 'ymin=-2, ymax=2,', 'zmin=-4, zmax=4,']) assert.ok(code.includes(bounds));
  assert.equal(body3D(code), body3D(original));
});

test('3D overall scale and existing equal-axis and width-height presets remain available', () => {
  const code = generateTikzExport3D({ ...input3D, scale: 2, axisScales: { x: 0.25, y: 1.5, z: 0.75 } });
  assert.match(code, /width=18cm, height=18cm/);
  assert.match(code, /unit vector ratio\*=0\.25 1\.5 0\.75,/);
  assert.match(generateTikzExport3D(input3D), /axis equal image,/);
  const widescreen = generateTikzExport3D({ ...input3D, aspectRatio: 16 / 9, equalAxes: false });
  assert.match(widescreen, /width=10\.8cm, height=6\.075cm/);
  assert.doesNotMatch(widescreen, /unit vector ratio|axis equal image/);
});

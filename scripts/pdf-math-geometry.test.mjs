import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { transformWithEsbuild } from 'vite';
import { OPS } from 'pdfjs-dist';

const { code } = await transformWithEsbuild(await readFile('src/lib/pdfMathGeometry.ts', 'utf8'), 'pdfMathGeometry.ts');
const moduleCode = code.replaceAll('"pdfjs-dist"', JSON.stringify(pathToFileURL(resolve('node_modules/pdfjs-dist/build/pdf.mjs')).href));
const { extractPdfRules } = await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString('base64')}`);
const extract = entries => extractPdfRules({ fnArray: entries.map(e => e[0]), argsArray: entries.map(e => e[1]) }, [1, 0, 0, -1, 0, 800]);

test('PDF math bars follow transforms and include painted rectangles and strokes', () => {
  const rules = extract([
    [OPS.save, []], [OPS.transform, [1, 0, 0, 1, 40, 500]],
    [OPS.constructPath, [[OPS.rectangle], [0, 0, 30, 0.4]]], [OPS.fill, []],
    [OPS.restore, []], [OPS.setLineWidth, [0.5]],
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [60, 400, 90, 400]]], [OPS.stroke, []],
  ]);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], { x: 40, y: 299.8, width: 30, thickness: 0.4 });
  assert.deepEqual(rules[1], { x: 60, y: 400, width: 30, thickness: 0.5 });
});

test('clipping rectangles, thick blocks, vertical lines and open filled lines are not math bars', () => {
  assert.deepEqual(extract([
    [OPS.constructPath, [[OPS.rectangle], [0, 0, 30, 0.4]]], [OPS.clip, []], [OPS.endPath, []],
    [OPS.constructPath, [[OPS.rectangle], [0, 0, 30, 20]]], [OPS.fill, []],
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [10, 20, 10, 60]]], [OPS.stroke, []],
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [10, 20, 60, 20]]], [OPS.fill, []],
  ]), []);
});

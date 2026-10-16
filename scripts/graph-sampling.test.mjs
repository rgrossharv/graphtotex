import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';

const { code } = await transformWithEsbuild(await readFile('src/lib/mathParser.ts', 'utf8'), 'mathParser.ts');
const source = code.replace(/from "mathjs"/, `from ${JSON.stringify(import.meta.resolve('mathjs'))}`);
const { prepareMath, sampleExpression } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const sample = (input, viewport, samples = 50) => {
  const parsed = prepareMath(input);
  assert.equal(parsed.error, null);
  return sampleExpression(parsed.evaluator, viewport.xMin, viewport.xMax, samples, viewport);
};
const crosses = (segments, x) => segments.some((segment) => segment[0].x < x && segment.at(-1).x > x);

test('tangent branches remain disconnected at every pole, including vertically zoomed-out views', () => {
  for (const ySpan of [4, 200, 20000]) {
    const viewport = { xMin: -10, xMax: 10, yMin: -ySpan / 2, yMax: ySpan / 2 };
    const segments = sample('tan(x)', viewport);
    assert.ok(segments.length >= 7);
    for (let k = -3; k <= 2; k++) assert.equal(crosses(segments, Math.PI / 2 + k * Math.PI), false, `no connection at pole ${k}, y span ${ySpan}`);
  }
});

test('shifted/scaled tangent, rational poles, and even-order poles keep their branches', () => {
  const viewport = { xMin: -2, xMax: 2, yMin: -1000, yMax: 1000 };
  for (const expression of ['1/(x-0.137)', '1/(x-0.137)^2']) {
    const segments = sample(expression, viewport, 33);
    assert.ok(segments.length >= 2);
    assert.equal(crosses(segments, 0.137), false);
  }
  const tangent = sample('3*tan(2*x-0.2)+5', viewport, 40);
  for (let k = -2; k <= 1; k++) {
    const pole = (Math.PI / 2 + k * Math.PI + 0.2) / 2;
    if (pole > viewport.xMin && pole < viewport.xMax) assert.equal(crosses(tangent, pole), false);
  }
});

test('steep continuous lines and vertical tangents are not mistaken for discontinuities', () => {
  const viewport = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  const line = sample('100000000*x', viewport, 32);
  assert.equal(line.length, 1);
  assert.ok(line[0][0].y < viewport.yMin && line[0].at(-1).y > viewport.yMax);
  const cusp = sample('sqrt(abs(x))', viewport, 32);
  assert.equal(cusp.length, 1);
  assert.ok(cusp[0].some((point) => point.x === 0 && point.y === 0));
});

test('real-valued domain boundaries are refined and invalid points never enter a path', () => {
  const viewport = { xMin: -2, xMax: 2, yMin: -3, yMax: 3 };
  for (const expression of ['sqrt(x)', 'log(x)']) {
    const segments = sample(expression, viewport, 33);
    assert.ok(segments.length);
    for (const point of segments.flat()) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= 0);
      assert.ok(point.y >= -3.6 - 1e-9 && point.y <= 3.6 + 1e-9);
    }
  }
  assert.ok(sample('sqrt(x)', viewport, 33)[0][0].x < 1e-6);
});

test('adaptive sampling resolves curvature beyond a coarse uniform sample grid', () => {
  const viewport = { xMin: -2, xMax: 2, yMin: -2, yMax: 2 };
  const segments = sample('sin(20*x)', viewport, 32);
  assert.ok(segments.flat().length > 100);
  assert.equal(segments.length, 1);
  for (const segment of segments) for (let i = 1; i < segment.length; i++) {
    const a = segment[i - 1], b = segment[i];
    const midpoint = Math.sin(20 * (a.x + b.x) / 2);
    assert.ok(Math.abs(midpoint - (a.y + b.y) / 2) <= 4 * 0.45 / 750 + 1e-8);
  }
});

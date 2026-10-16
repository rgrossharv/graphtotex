import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';

const { code } = await transformWithEsbuild(await readFile('src/lib/complexMath.ts', 'utf8'), 'complexMath.ts');
const source = code.replace(/from "mathjs"/, `from ${JSON.stringify(import.meta.resolve('mathjs'))}`);
const { prepareComplex, complexColor } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const near = (actual, real, imaginary) => {
  assert.ok(actual);
  assert.ok(Math.abs(actual.re - real) < 1e-10);
  assert.ok(Math.abs(actual.im - imaginary) < 1e-10);
};

test('complex functions evaluate imaginary inputs, conjugates, and principal branches', () => {
  near(prepareComplex('z^2').evaluate(1, 1), 0, 2);
  near(prepareComplex('f(z) = exp(z)').evaluate(0, Math.PI), -1, 0);
  near(prepareComplex('conj(z)').evaluate(2, -3), 2, 3);
  near(prepareComplex('sqrt(z)').evaluate(-1, 0), 0, 1);
  near(prepareComplex('log(z)').evaluate(-1, 0), 0, Math.PI);
  near(prepareComplex('1/z').evaluate(1, 1), 0.5, -0.5);
  near(prepareComplex('ln(z)').evaluate(Math.E, 0), 1, 0);
});

test('undefined complex points stay undefined and color encodes argument and magnitude', () => {
  assert.equal(prepareComplex('1/z').evaluate(0, 0), null);
  assert.equal(prepareComplex('log(z)').evaluate(0, 0), null);
  assert.deepEqual(complexColor({ re: 0, im: 0 }), [0, 0, 0]);
  assert.deepEqual(complexColor(null), [18, 18, 22]);
  assert.notDeepEqual(complexColor({ re: 1, im: 0 }), complexColor({ re: -1, im: 0 }));
  assert.notDeepEqual(complexColor({ re: 1, im: 0 }), complexColor({ re: 2, im: 0 }));
});

test('complex graph expressions reject unknown variables, assignments, and unsupported calls', () => {
  for (const expression of ['z=2', 'x+1', '[z, i]', 'import("x")', 'factorial(1000)', 'z;z']) assert.throws(() => prepareComplex(expression));
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';
import { ComputeEngine } from '@cortex-js/compute-engine';

const { code } = await transformWithEsbuild(await readFile('src/lib/calculatorEngine.ts', 'utf8'), 'calculatorEngine.ts');
const source = code.replace(/from "@cortex-js\/compute-engine"/, `from ${JSON.stringify(import.meta.resolve('@cortex-js/compute-engine'))}`);
const { calculate } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const base = { input: '', secondInput: '', mode: 'calculus', operation: 'auto', variables: 'x', order: 1, lower: '0', upper: '1', point: '0', angleUnit: 'rad' };
const ce = new ComputeEngine();
const equivalent = (actual, expected) => assert.ok(ce.parse(actual.replace(/ \+ C$/, '')).isEqual(ce.parse(expected)), `${actual} equals ${expected}`);
const run = (request) => calculate({ ...base, ...request });

test('scientific calculator preserves exact values and evaluates degree and radian trig', () => {
  equivalent(run({ mode: 'scientific', input: String.raw`\sqrt{18}/3+\sin(\pi/6)` }).latex, String.raw`\sqrt{2}+\frac12`);
  equivalent(run({ mode: 'scientific', input: String.raw`\sin(30)`, angleUnit: 'deg' }).latex, '1/2');
  equivalent(run({ mode: 'scientific', input: String.raw`\arcsin(1/2)`, angleUnit: 'deg' }).latex, '30');
  equivalent(run({ mode: 'scientific', input: 'ln(e^2)' }).latex, '2');
  equivalent(run({ mode: 'scientific', input: '5!' }).latex, '120');
});

test('TeX derivatives, repeated partial derivatives and integral bounds are respected', () => {
  equivalent(run({ input: String.raw`\frac{d}{dx}\sin(x^2)` }).latex, String.raw`2x\cos(x^2)`);
  equivalent(run({ input: String.raw`\frac{\partial^2}{\partial x^2}(x^3 y)` }).latex, '6xy');
  const integral = run({ input: String.raw`\int x\sin(x)\,dx` });
  equivalent(integral.latex, String.raw`\sin(x)-x\cos(x)`);
  assert.match(integral.latex, / \+ C$/);
  equivalent(run({ input: String.raw`\int_0^1 x^2\,dx` }).latex, '1/3');
  equivalent(run({ input: String.raw`\int_0^1\int_0^1 xy\,dx\,dy` }).latex, '1/4');
  equivalent(run({ input: String.raw`\int_0^1\int_0^1\int_0^1 xyz\,dx\,dy\,dz` }).latex, '1/8');
  equivalent(run({ input: 'x^3', operation: 'derivative', order: 2 }).latex, '6x');
  equivalent(run({ input: 'x^2', operation: 'definite', lower: '1', upper: '2' }).latex, '7/3');
  equivalent(run({ input: String.raw`\lim_{x\to0}\frac{\sin(x)}x` }).latex, '1');
  equivalent(run({ input: String.raw`\int_1^\infty\frac1{x^2}\,dx` }).latex, '1');
  assert.equal(run({ input: String.raw`\int_{-1}^1\frac1{x^2}\,dx` }).latex, '\\infty');
});

test('gradient, Hessian, divergence, curl and Jacobian use the selected variables', () => {
  assert.equal(run({ input: 'x^2 y+y z^2', operation: 'gradient', variables: 'x,y,z' }).latex, String.raw`\begin{bmatrix}2xy \\ x^2+z^2 \\ 2yz\end{bmatrix}`);
  assert.equal(run({ input: 'x^2+y^2', operation: 'hessian', variables: 'x,y' }).latex, String.raw`\begin{bmatrix}2 & 0 \\ 0 & 2\end{bmatrix}`);
  equivalent(run({ input: '[x^2,y^2,z^2]', operation: 'divergence', variables: 'x,y,z' }).latex, '2x+2y+2z');
  assert.equal(run({ input: '[-y,x,0]', operation: 'curl', variables: 'x,y,z' }).latex, String.raw`\begin{bmatrix}0 \\ 0 \\ 2\end{bmatrix}`);
  assert.equal(run({ input: '[x^2+y,xy]', operation: 'jacobian', variables: 'x,y' }).latex, String.raw`\begin{bmatrix}2x & 1 \\ y & x\end{bmatrix}`);
});

test('matrix operations return exact TeX, and singular or invalid dimensions are rejected', () => {
  const input = String.raw`\begin{bmatrix}1&2\\3&4\end{bmatrix}`;
  equivalent(run({ mode: 'linear', operation: 'determinant', input }).latex, '-2');
  assert.equal(run({ mode: 'linear', operation: 'inverse', input }).latex, String.raw`\begin{bmatrix}-2 & 1 \\ \frac{3}{2} & -\frac{1}{2}\end{bmatrix}`);
  assert.equal(run({ mode: 'linear', operation: 'rref', input }).latex, String.raw`\begin{bmatrix}1 & 0 \\ 0 & 1\end{bmatrix}`);
  equivalent(run({ mode: 'linear', operation: 'rank', input }).latex, '2');
  assert.equal(run({ mode: 'linear', operation: 'solve', input: String.raw`\begin{bmatrix}2&1\\1&-1\end{bmatrix}`, secondInput: String.raw`\begin{bmatrix}5\\1\end{bmatrix}` }).latex, String.raw`\begin{bmatrix}2 \\ 1\end{bmatrix}`);
  assert.throws(() => run({ mode: 'linear', operation: 'inverse', input: String.raw`\begin{bmatrix}1&2\\2&4\end{bmatrix}` }), /singular/);
  assert.throws(() => run({ input: String.raw`\begin{bmatrix}1&2\\2&4\end{bmatrix}^{-1}` }), /singular/);
  assert.throws(() => run({ mode: 'linear', operation: 'determinant', input: String.raw`\begin{bmatrix}1&2&3\\4&5&6\end{bmatrix}` }), /square/);
  assert.throws(() => run({ mode: 'linear', operation: 'inverse', input: String.raw`\begin{bmatrix}1&2\\3\end{bmatrix}` }));
});

test('vector products and magnitude support TeX column vectors', () => {
  const input = String.raw`\begin{bmatrix}1\\0\\0\end{bmatrix}`, secondInput = String.raw`\begin{bmatrix}0\\1\\0\end{bmatrix}`;
  assert.equal(run({ mode: 'linear', operation: 'cross', input, secondInput }).latex, String.raw`\begin{bmatrix}0 \\ 0 \\ 1\end{bmatrix}`);
  equivalent(run({ mode: 'linear', operation: 'dot', input: '[1,2,3]', secondInput: '[4,5,6]' }).latex, '32');
  equivalent(run({ mode: 'linear', operation: 'norm', input: '[3,4]' }).latex, '5');
});

test('invalid TeX, empty expressions and invalid variable lists have actionable errors', () => {
  assert.throws(() => run({ input: '' }), /Enter a TeX expression/);
  assert.throws(() => run({ input: String.raw`\frac{1}{` }), /syntax/);
  assert.throws(() => run({ input: 'x^2', variables: 'x,x' }), /different/);
  assert.throws(() => run({ input: String.raw`\frac10` }), /undefined/);
  assert.equal(run({ input: String.raw`\int\sin(x^x)\,dx` }).unevaluated, true);
});

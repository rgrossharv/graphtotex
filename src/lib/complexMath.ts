import { all, create, type MathNode } from 'mathjs';

const math = create(all, {});
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'exp', 'log', 'sqrt', 'abs', 'arg', 'conj', 're', 'im']);
const TYPES = new Set(['ConstantNode', 'SymbolNode', 'OperatorNode', 'FunctionNode', 'ParenthesisNode']);
const OPERATORS = new Set(['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus']);
export interface ComplexValue { re: number; im: number }
export interface ComplexView { real: number; imaginary: number; radius: number }

export function prepareComplex(input: string) {
  if (!input.trim() || input.length > 500) throw new Error('Enter a function of z, up to 500 characters.');
  const node = math.parse(input.trim().replace(/^f\s*\(z\)\s*=\s*/, '').replace(/\*\*/g, '^').replace(/\bln\s*\(/g, 'log('));
  node.traverse((child: MathNode, _path: string, parent: MathNode | null) => {
    if (!TYPES.has(child.type)) throw new Error('Use a single expression in z, with numbers, i, pi, and e.');
    if (child.type === 'OperatorNode' && !OPERATORS.has((child as unknown as { fn: string }).fn)) throw new Error('Use arithmetic operators +, −, *, /, and ^.');
    if (child.type === 'FunctionNode') {
      const name = (child as unknown as { fn: { name: string } }).fn.name;
      if (!FUNCTIONS.has(name)) throw new Error(`Unsupported function: ${name}. Try exp, log, sin, sqrt, abs, or conj.`);
    }
    if (child.type === 'SymbolNode') {
      const name = (child as unknown as { name: string }).name;
      const functionName = parent?.type === 'FunctionNode' && (parent as unknown as { fn: MathNode }).fn === child;
      if (!functionName && !['z', 'i', 'pi', 'e'].includes(name)) throw new Error(`Unknown symbol ${name}. Use z as the variable and i for the imaginary unit.`);
    }
  });
  const compiled = node.compile();
  const scope = { z: math.complex(0, 0) };
  const evaluate = (re: number, im: number): ComplexValue | null => {
    try {
      scope.z.re = re; scope.z.im = im;
      const value = compiled.evaluate(scope) as number | ComplexValue;
      const result = typeof value === 'number' ? { re: value, im: 0 } : value;
      return result && Number.isFinite(result.re) && Number.isFinite(result.im) ? { re: result.re, im: result.im } : null;
    } catch { return null; }
  };
  return { latex: node.toTex({ parenthesis: 'auto' }), evaluate };
}

// Argument sets hue; logarithmic magnitude bands reveal zeros and poles.
export function complexColor(value: ComplexValue | null): [number, number, number] {
  if (!value) return [18, 18, 22];
  const magnitude = Math.hypot(value.re, value.im);
  if (magnitude === 0) return [0, 0, 0];
  const hue = ((Math.atan2(value.im, value.re) / (2 * Math.PI) + 1) % 1) * 6;
  const band = ((Math.log2(magnitude) % 1) + 1) % 1;
  const brightness = (0.67 + 0.33 * band) * (0.3 + 0.7 * (1 - 1 / (1 + magnitude)));
  const saturation = 0.78;
  const chroma = brightness * saturation, offset = brightness - chroma;
  const x = chroma * (1 - Math.abs(hue % 2 - 1));
  const rgb = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return rgb.map(channel => Math.round((channel + offset) * 255)) as [number, number, number];
}

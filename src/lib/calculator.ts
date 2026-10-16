export type CalculatorMode = 'scientific' | 'calculus' | 'linear';
export interface CalculationRequest {
  input: string;
  secondInput: string;
  mode: CalculatorMode;
  operation: string;
  variables: string;
  order: number;
  lower: string;
  upper: string;
  point: string;
  angleUnit: 'rad' | 'deg';
}
export interface CalculationResult {
  inputLatex: string;
  latex: string;
  approximate: string | null;
  equation: string;
  note: string | null;
  unevaluated: boolean;
}
export const OPERATIONS: Record<CalculatorMode, { value: string; label: string }[]> = {
  scientific: [{ value: 'auto', label: 'Evaluate' }, { value: 'simplify', label: 'Simplify' }, { value: 'expand', label: 'Expand' }],
  calculus: [
    { value: 'auto', label: 'Read operation from TeX' }, { value: 'derivative', label: 'Derivative / partial derivative' },
    { value: 'integral', label: 'Indefinite integral' }, { value: 'definite', label: 'Definite integral' },
    { value: 'limit', label: 'Limit' }, { value: 'gradient', label: 'Gradient' },
    { value: 'hessian', label: 'Hessian' }, { value: 'jacobian', label: 'Jacobian' },
    { value: 'divergence', label: 'Divergence' }, { value: 'curl', label: 'Curl' }
  ],
  linear: [
    { value: 'auto', label: 'Evaluate matrix expression' }, { value: 'determinant', label: 'Determinant' },
    { value: 'inverse', label: 'Inverse' }, { value: 'transpose', label: 'Transpose' },
    { value: 'rref', label: 'Reduced row echelon form' }, { value: 'rank', label: 'Rank' },
    { value: 'trace', label: 'Trace' }, { value: 'eigenvalues', label: 'Eigenvalues' },
    { value: 'multiply', label: 'A × B' }, { value: 'add', label: 'A + B' },
    { value: 'solve', label: 'Solve Ax = b' }, { value: 'dot', label: 'Dot product' },
    { value: 'cross', label: 'Cross product' }, { value: 'norm', label: 'Vector magnitude' }
  ]
};
export const CALCULATOR_EXAMPLES: { label: string; mode: CalculatorMode; input: string; operation?: string; variables?: string; secondInput?: string }[] = [
  { label: 'Scientific expression', mode: 'scientific', input: String.raw`\frac{\sqrt{18}}{3}+\sin\left(\frac{\pi}{6}\right)` },
  { label: 'Chain rule', mode: 'calculus', input: String.raw`\frac{d}{dx}\sin(x^2)` },
  { label: 'Integration by parts', mode: 'calculus', input: String.raw`\int x\sin(x)\,dx` },
  { label: 'Definite integral', mode: 'calculus', input: String.raw`\int_{0}^{\pi}\sin(x)\,dx` },
  { label: 'Double integral', mode: 'calculus', input: String.raw`\int_{0}^{1}\int_{0}^{1}xy\,dx\,dy` },
  { label: 'Triple integral', mode: 'calculus', input: String.raw`\int_{0}^{1}\int_{0}^{1}\int_{0}^{1}xyz\,dx\,dy\,dz` },
  { label: 'Multivariable gradient', mode: 'calculus', operation: 'gradient', variables: 'x, y, z', input: 'x^2 y + y z^2' },
  { label: 'Limit', mode: 'calculus', input: String.raw`\lim_{x\to 0}\frac{\sin(x)}{x}` },
  { label: 'Matrix inverse', mode: 'linear', operation: 'inverse', input: String.raw`\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}` },
  { label: 'Row reduction', mode: 'linear', operation: 'rref', input: String.raw`\begin{bmatrix}1 & 2 & 3 \\ 2 & 4 & 6 \\ 1 & 1 & 1\end{bmatrix}` },
  { label: 'Solve a linear system', mode: 'linear', operation: 'solve', input: String.raw`\begin{bmatrix}2 & 1 \\ 1 & -1\end{bmatrix}`, secondInput: String.raw`\begin{bmatrix}5 \\ 1\end{bmatrix}` },
  { label: 'Cross product', mode: 'linear', operation: 'cross', input: String.raw`\begin{bmatrix}1 \\ 0 \\ 0\end{bmatrix}`, secondInput: String.raw`\begin{bmatrix}0 \\ 1 \\ 0\end{bmatrix}` }
];
export const TEX_COMPLETIONS = [
  { command: '\\frac', insert: '\\frac{a}{b}', label: 'Fraction', select: 'a' },
  { command: '\\sqrt', insert: '\\sqrt{x}', label: 'Square root', select: 'x' },
  { command: '\\sin', insert: '\\sin(x)', label: 'Sine', select: 'x' },
  { command: '\\cos', insert: '\\cos(x)', label: 'Cosine', select: 'x' },
  { command: '\\tan', insert: '\\tan(x)', label: 'Tangent', select: 'x' },
  { command: '\\arcsin', insert: '\\arcsin(x)', label: 'Inverse sine', select: 'x' },
  { command: '\\arccos', insert: '\\arccos(x)', label: 'Inverse cosine', select: 'x' },
  { command: '\\arctan', insert: '\\arctan(x)', label: 'Inverse tangent', select: 'x' },
  { command: '\\ln', insert: '\\ln(x)', label: 'Natural logarithm', select: 'x' },
  { command: '\\log', insert: '\\log_{10}(x)', label: 'Logarithm', select: 'x' },
  { command: '\\int', insert: '\\int x\\,dx', label: 'Integral', select: 'x' },
  { command: '\\iint', insert: '\\int_{0}^{1}\\int_{0}^{1}xy\\,dx\\,dy', label: 'Double integral', select: 'xy' },
  { command: '\\iiint', insert: '\\int_{0}^{1}\\int_{0}^{1}\\int_{0}^{1}xyz\\,dx\\,dy\\,dz', label: 'Triple integral', select: 'xyz' },
  { command: '\\lim', insert: '\\lim_{x\\to 0}\\frac{\\sin(x)}{x}', label: 'Limit', select: '0' },
  { command: '\\sum', insert: '\\sum_{n=1}^{10} n', label: 'Finite sum', select: '10' },
  { command: '\\pi', insert: '\\pi ', label: 'Pi', select: '' },
  { command: '\\infty', insert: '\\infty ', label: 'Infinity', select: '' },
  { command: '\\partial', insert: '\\frac{\\partial}{\\partial x}(x^2 y)', label: 'Partial derivative', select: 'x^2 y' },
  { command: '\\begin{bmatrix}', insert: '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}', label: '2 × 2 matrix', select: '1' }
];

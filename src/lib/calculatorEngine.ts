import { ComputeEngine, type MathJsonExpression } from '@cortex-js/compute-engine';
import type { CalculationRequest, CalculationResult } from './calculator';

type Expr = MathJsonExpression;
const isArray = (value: Expr): value is readonly [string, ...Expr[]] => Array.isArray(value);
const head = (value: Expr) => isArray(value) ? value[0] : null;
const has = (value: Expr, name: string): boolean => isArray(value) && (value[0] === name || value.slice(1).some((part) => has(part, name)));
const list = (...items: Expr[]): Expr => ['List', ...items];

export function calculate(request: CalculationRequest): CalculationResult {
  const ce = new ComputeEngine({ precision: 20 });
  const parse = (input: string): Expr => {
    if (!input.trim()) throw new Error('Enter a TeX expression first.');
    if (input.length > 3000) throw new Error('Use an expression shorter than 3,000 characters.');
    const normalized = input.trim().replace(/^\$\$?|\$\$?$/g, '').replace(/^\\\[|\\\]$/g, '')
      .replace(/\b(sin|cos|tan|sinh|cosh|tanh|arcsin|arccos|arctan|ln|log|sqrt|exp)\b/g, (match, _name, offset: number, source: string) => source[offset - 1] === '\\' ? match : `\\${match}`);
    const parsed = ce.parse(normalized, { form: 'raw' });
    if (!parsed.isValid || has(parsed.json, 'Error')) throw new Error('Check the TeX syntax, braces, and matrix row lengths.');
    return parsed.json;
  };
  const strip = (value: Expr): Expr => {
    if (!isArray(value)) return value;
    if (value[0] === 'Matrix' || value[0] === 'Delimiter') return strip(value[1]);
    return [value[0], ...value.slice(1).map(strip)];
  };
  const variables = request.variables.split(',').map((item) => item.trim()).filter(Boolean);
  if (!variables.length || variables.length > 3 || variables.some((v) => !/^[a-zA-Z]$/.test(v)) || new Set(variables).size !== variables.length) {
    throw new Error('Use one to three different single-letter variables, such as x, y, z.');
  }
  const variable = variables[0];
  const derivative = (value: Expr, v: string): Expr => ['D', value, v];
  const vector = (value: Expr): Expr[] => {
    const entries = strip(value);
    if (!isArray(entries) || entries[0] !== 'List') throw new Error('Enter a vector as a column matrix or [x, y, z].');
    const parts = entries.slice(1);
    if (parts.every((part) => isArray(part) && part[0] === 'List' && part.length === 2)) return parts.map((part) => (part as readonly Expr[])[1]);
    if (parts.length === 1 && isArray(parts[0]) && parts[0][0] === 'List') return parts[0].slice(1);
    if (parts.some(Array.isArray) && parts.some((part) => head(part) === 'List')) throw new Error('Use a row or column vector.');
    return parts;
  };
  const matrix = (value: Expr): Expr => {
    const rows = strip(value);
    if (!isArray(rows) || rows[0] !== 'List' || rows.length < 2 || !rows.slice(1).every((row) => head(row) === 'List')) throw new Error('Enter a matrix using \\begin{bmatrix}…\\end{bmatrix}.');
    const lengths = rows.slice(1).map((row) => (row as readonly Expr[]).length - 1);
    if (rows.length > 9 || Math.max(...lengths) > 8) throw new Error('Matrices can have up to 8 rows and 8 columns.');
    if (new Set(lengths).size !== 1 || !lengths[0]) throw new Error('Each matrix row must have the same number of entries.');
    return rows;
  };
  let expression = parse(request.input);
  if (request.mode === 'scientific' && request.angleUnit === 'deg') {
    const degrees = (value: Expr): Expr => {
      if (!isArray(value)) return value;
      const parts = value.slice(1).map(degrees);
      if (['Sin', 'Cos', 'Tan', 'Cot', 'Sec', 'Csc'].includes(String(value[0])) && head(parts[0]) !== 'Degrees') return [value[0], ['Degrees', parts[0]]];
      if (['Arcsin', 'Arccos', 'Arctan'].includes(String(value[0]))) return ['Multiply', ['Divide', 180, 'Pi'], [value[0], ...parts]];
      return [value[0], ...parts];
    };
    expression = degrees(expression);
  }
  const operation = request.operation;
  let note: string | null = null;
  if (operation === 'derivative') {
    if (!Number.isInteger(request.order) || request.order < 1 || request.order > 5) throw new Error('Choose a derivative order from 1 to 5.');
    for (let i = 0; i < request.order; i++) expression = derivative(expression, variable);
  } else if (operation === 'integral') expression = ['Integrate', expression, variable];
  else if (operation === 'definite') expression = ['Integrate', expression, ['Tuple', variable, parse(request.lower), parse(request.upper)]];
  else if (operation === 'limit') expression = ['Limit', ['Function', expression, variable], parse(request.point)];
  else if (operation === 'gradient') expression = list(...variables.map((v) => derivative(expression, v)));
  else if (operation === 'hessian') expression = list(...variables.map((a) => list(...variables.map((b) => derivative(derivative(expression, a), b)))));
  else if (operation === 'jacobian' || operation === 'divergence' || operation === 'curl') {
    const entries = vector(expression);
    if (operation === 'jacobian') expression = list(...entries.map((entry) => list(...variables.map((v) => derivative(entry, v)))));
    else {
      if (entries.length !== variables.length) throw new Error('The vector and variable list must have the same length.');
      if (operation === 'divergence') expression = ['Add', ...entries.map((entry, i) => derivative(entry, variables[i]))];
      else {
        if (variables.length !== 3) throw new Error('Curl needs a three-component vector and three variables.');
        expression = list(...[[2, 1], [0, 2], [1, 0]].map(([a, b]) => ['Subtract', derivative(entries[a], variables[b]), derivative(entries[b], variables[a])] as Expr));
      }
    }
  } else if (request.mode === 'linear' && operation !== 'auto') {
    const operators: Record<string, string> = { determinant: 'Determinant', inverse: 'Inverse', transpose: 'Transpose', rref: 'RowReduce', rank: 'MatrixRank', trace: 'Trace', eigenvalues: 'Eigenvalues' };
    if (operators[operation]) {
      const m = matrix(expression);
      if (['determinant', 'inverse', 'trace', 'eigenvalues'].includes(operation) && (m as readonly Expr[]).length !== ((m as readonly Expr[])[1] as readonly Expr[]).length) throw new Error('This operation needs a square matrix.');
      if (operation === 'inverse' && ce.box(['Determinant', m]).evaluate().isSame(ce.Zero)) throw new Error('This matrix is singular, so it has no inverse.');
      expression = [operators[operation], m];
    } else if (operation === 'dot' || operation === 'cross' || operation === 'norm') {
      const a = vector(expression);
      if (operation === 'norm') expression = ['Sqrt', ['Add', ...a.map((entry) => ['Power', ['Abs', entry], 2] as Expr)]];
      else {
        const b = vector(parse(request.secondInput));
        if (a.length !== b.length) throw new Error('Both vectors must have the same number of components.');
        if (operation === 'dot') expression = ['Add', ...a.map((entry, i) => ['Multiply', entry, b[i]] as Expr)];
        else {
          if (a.length !== 3) throw new Error('The cross product needs two three-component vectors.');
          expression = list(...[[1, 2], [2, 0], [0, 1]].map(([i, j]) => ['Subtract', ['Multiply', a[i], b[j]], ['Multiply', a[j], b[i]]] as Expr));
        }
      }
    } else {
      const a = matrix(expression), b = matrix(parse(request.secondInput));
      if (operation === 'solve') {
        if ((a as readonly Expr[]).length !== ((a as readonly Expr[])[1] as readonly Expr[]).length) throw new Error('Solve Ax = b currently needs a square coefficient matrix.');
        if (ce.box(['Determinant', a]).evaluate().isSame(ce.Zero)) throw new Error('This system has no unique solution because A is singular.');
        expression = ['Multiply', ['Inverse', a], b];
      } else expression = [operation === 'multiply' ? 'Multiply' : 'Add', a, b];
    }
  }
  const validateMatrices = (value: Expr): void => {
    if (!isArray(value)) return;
    if (value[0] === 'Matrix') matrix(value);
    if (value[0] === 'Inverse') {
      const candidate = strip(value[1]);
      if (head(candidate) === 'List' && ce.box(['Determinant', candidate]).evaluate().isSame(ce.Zero)) throw new Error('This matrix is singular, so it has no inverse.');
    }
    value.slice(1).forEach(validateMatrices);
  };
  validateMatrices(expression);
  const boxed = ce.box(expression);
  if (!boxed.isValid) throw new Error('Check the expression and the dimensions required by this operation.');
  const result = operation === 'simplify' ? boxed.simplify() : operation === 'expand' ? ce.box(['Expand', expression]).evaluate() : boxed.evaluate();
  if (!result.isValid || has(result.json, 'Error')) throw new Error('This calculation is undefined or its matrix dimensions do not match.');
  const serialize = (value: Expr): string => {
    if (isArray(value)) {
      const operators: Record<string, string> = { Determinant: '\\det', RowReduce: '\\operatorname{rref}', MatrixRank: '\\operatorname{rank}', Trace: '\\operatorname{tr}', Eigenvalues: '\\operatorname{eig}' };
      if (value[0] === 'Inverse') return `${serialize(strip(value[1]))}^{-1}`;
      if (value[0] === 'Transpose') return `${serialize(strip(value[1]))}^{\\mathsf{T}}`;
      if (operators[value[0]]) return `${operators[value[0]]}\\left(${serialize(strip(value[1]))}\\right)`;
      if (['Add', 'Multiply'].includes(value[0]) && value.slice(1).some((item) => has(item, 'List'))) return value.slice(1).map(serialize).join(value[0] === 'Add' ? ' + ' : ' \\cdot ');
    }
    if (isArray(value) && value[0] === 'List') {
      const entries = value.slice(1);
      const rows = entries.every((entry) => head(entry) === 'List') ? entries.map((entry) => (entry as readonly Expr[]).slice(1)) : entries.map((entry) => [entry]);
      return `\\begin{bmatrix}${rows.map((row) => row.map((entry) => ce.box(entry).latex).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;
    }
    return ce.box(value).latex;
  };
  const indefinite = (value: Expr): boolean => isArray(value) && ((value[0] === 'Integrate' && typeof value[2] === 'string') || value.slice(1).some(indefinite));
  const unevaluated = ['Integrate', 'D', 'Limit', 'Inverse', 'Eigenvalues', 'RowReduce'].some((name) => has(result.json, name));
  let latex = serialize(result.json);
  if (indefinite(expression) && !unevaluated) {
    latex += ' + C';
    note = 'C is the constant of integration. Other variables are held constant.';
  }
  if (unevaluated) note = 'A closed-form result was not found. The remaining operation is shown unevaluated.';
  if (['NaN', 'Undefined', 'ComplexInfinity'].includes(String(result.json))) throw new Error('This expression is undefined.');
  const numeric = !indefinite(expression) && !unevaluated ? result.N() : null;
  const approximate = numeric && numeric.latex !== result.latex && !numeric.unknowns.length ? serialize(numeric.json) : null;
  const inputLatex = serialize(boxed.json);
  return { inputLatex, latex, approximate, equation: `${inputLatex} = ${latex}`, note, unevaluated };
}

import { all, create, type MathNode } from 'mathjs';
import { normalizeInput } from './mathParser';

const math = create(all, {});

const BLOCKED_NODE_TYPES = new Set([
  'AssignmentNode',
  'FunctionAssignmentNode',
  'AccessorNode',
  'IndexNode',
  'RangeNode',
  'ObjectNode',
  'ArrayNode',
  'BlockNode'
]);

const ALLOWED_SYMBOLS = new Set(['x', 'y', 'pi', 'e']);

const ALLOWED_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sqrt',
  'abs',
  'log',
  'log10',
  'exp'
]);

export interface PreparedSurfaceMath {
  normalizedInput: string;
  latex: string | null;
  error: string | null;
  evaluator: ((x: number, y: number) => number | null) | null;
  node: MathNode | null;
}

function validateNode(node: MathNode): string | null {
  let error: string | null = null;

  node.traverse((child: MathNode, _path: string, parent: MathNode | null) => {
    if (error) {
      return;
    }

    if (BLOCKED_NODE_TYPES.has(child.type)) {
      error = `Unsupported expression feature: ${child.type}`;
      return;
    }

    if (child.type === 'FunctionNode') {
      const fnNode = child as unknown as {
        fn?: { type: string; name?: string };
      };
      const fnName = fnNode.fn?.name;
      if (!fnName || !ALLOWED_FUNCTIONS.has(fnName)) {
        error = `Unsupported function "${fnName ?? 'unknown'}".`;
      }
      return;
    }

    if (child.type === 'SymbolNode') {
      const name = (child as unknown as { name: string }).name;
      const isFunctionName =
        parent?.type === 'FunctionNode' &&
        (parent as unknown as { fn?: MathNode }).fn === child;

      if (isFunctionName) {
        return;
      }

      if (!ALLOWED_SYMBOLS.has(name)) {
        error = `Unknown symbol "${name}". Use x, y, pi, or e as symbols.`;
      }
    }
  });

  return error;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value && typeof value === 'object' && 're' in value && 'im' in value) {
    const maybeComplex = value as { re: number; im: number };
    if (Number.isFinite(maybeComplex.re) && Math.abs(maybeComplex.im) < 1e-10) {
      return maybeComplex.re;
    }
  }

  return null;
}

export function prepareMath3D(rawInput: string): PreparedSurfaceMath {
  const normalizedInput = normalizeInput(rawInput);

  if (!normalizedInput) {
    return {
      normalizedInput,
      latex: null,
      error: null,
      evaluator: null,
      node: null
    };
  }

  if (normalizedInput.includes('=')) {
    return {
      normalizedInput,
      latex: normalizedInput,
      error: '3D mode expects z = f(x, y) entered as f(x, y) without an equals sign.',
      evaluator: null,
      node: null
    };
  }

  try {
    const node = math.parse(normalizedInput);
    const validationError = validateNode(node);

    if (validationError) {
      return {
        normalizedInput,
        latex: null,
        error: validationError,
        evaluator: null,
        node: null
      };
    }

    const compiled = node.compile();
    const latex = `z = ${node.toTex({ parenthesis: 'auto' })}`;

    const evaluator = (x: number, y: number): number | null => {
      try {
        const value = compiled.evaluate({ x, y });
        return toFiniteNumber(value);
      } catch {
        return null;
      }
    };

    return {
      normalizedInput,
      latex,
      error: null,
      evaluator,
      node
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse expression.';
    return {
      normalizedInput,
      latex: null,
      error: message,
      evaluator: null,
      node: null
    };
  }
}

export function parseSurfaceDomainBounds(
  domainMin: string,
  domainMax: string,
  fallbackMin: number,
  fallbackMax: number
): { min: number; max: number } {
  const parsedMin = Number.parseFloat(domainMin);
  const parsedMax = Number.parseFloat(domainMax);

  const min = Number.isFinite(parsedMin) ? parsedMin : fallbackMin;
  const max = Number.isFinite(parsedMax) ? parsedMax : fallbackMax;

  if (max <= min) {
    return { min: Math.min(min, max), max: Math.max(min, max) + 1e-6 };
  }

  return { min, max };
}

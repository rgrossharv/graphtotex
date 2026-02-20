import { all, create, type MathNode } from 'mathjs';
import type { Point, Viewport } from '../types';

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

const ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e']);
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

export interface PreparedMath {
  normalizedInput: string;
  latex: string | null;
  error: string | null;
  evaluator: ((x: number) => number | null) | null;
  node: MathNode | null;
}

export function normalizeInput(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.replace(/\*\*/g, '^').replace(/\bln\s*\(/g, 'log(');
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
        error = `Unknown symbol "${name}". Use x, pi, or e as symbols.`;
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

export function prepareMath(rawInput: string): PreparedMath {
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
    const latex = node.toTex({ parenthesis: 'auto' });

    const evaluator = (x: number): number | null => {
      try {
        const value = compiled.evaluate({ x });
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

export function parseDomainBounds(
  domainMin: string,
  domainMax: string,
  viewport: Viewport
): { xMin: number; xMax: number } {
  const parsedMin = Number.parseFloat(domainMin);
  const parsedMax = Number.parseFloat(domainMax);

  const xMin = Number.isFinite(parsedMin) ? parsedMin : viewport.xMin;
  const xMax = Number.isFinite(parsedMax) ? parsedMax : viewport.xMax;

  if (xMax <= xMin) {
    return { xMin: Math.min(xMin, xMax), xMax: Math.max(xMin, xMax) + 1e-6 };
  }

  return { xMin, xMax };
}

export function sampleExpression(
  evaluator: (x: number) => number | null,
  xMin: number,
  xMax: number,
  samples: number,
  viewport: Viewport,
  maxAbsY = 1e6
): Point[][] {
  const clampedSamples = Math.max(32, Math.min(5000, Math.round(samples)));
  const segments: Point[][] = [];
  let currentSegment: Point[] = [];

  const ySpan = Math.max(1e-6, viewport.yMax - viewport.yMin);
  const jumpThreshold = ySpan * 8;
  let prevY: number | null = null;

  for (let i = 0; i <= clampedSamples; i += 1) {
    const t = i / clampedSamples;
    const x = xMin + t * (xMax - xMin);
    const y = evaluator(x);

    if (y === null || !Number.isFinite(y) || Math.abs(y) > maxAbsY) {
      if (currentSegment.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = [];
      prevY = null;
      continue;
    }

    if (prevY !== null && Math.abs(y - prevY) > jumpThreshold) {
      if (currentSegment.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = [];
    }

    currentSegment.push({ x, y });
    prevY = y;
  }

  if (currentSegment.length > 1) {
    segments.push(currentSegment);
  }

  return segments;
}

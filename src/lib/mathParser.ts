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

const BASE_ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e']);
const IMPLICIT_ALLOWED_SYMBOLS = new Set(['x', 'y', 'pi', 'e']);

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
  mode: 'explicit' | 'implicit';
  normalizedInput: string;
  latex: string | null;
  error: string | null;
  evaluator: ((x: number) => number | null) | null;
  implicitEvaluator: ((x: number, y: number) => number | null) | null;
  node: MathNode | null;
}

export function normalizeInput(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.replace(/\*\*/g, '^').replace(/\bln\s*\(/g, 'log(');
}

function validateNode(node: MathNode, allowedSymbols: Set<string>): string | null {
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

      if (!allowedSymbols.has(name)) {
        const allowedList = [...allowedSymbols].join(', ');
        error = `Unknown symbol "${name}". Use ${allowedList} as symbols.`;
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

function prepareExplicit(input: string): PreparedMath {
  try {
    const node = math.parse(input);
    const validationError = validateNode(node, BASE_ALLOWED_SYMBOLS);

    if (validationError) {
      return {
        mode: 'explicit',
        normalizedInput: input,
        latex: null,
        error: validationError,
        evaluator: null,
        implicitEvaluator: null,
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
      mode: 'explicit',
      normalizedInput: input,
      latex,
      error: null,
      evaluator,
      implicitEvaluator: null,
      node
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse expression.';
    return {
      mode: 'explicit',
      normalizedInput: input,
      latex: null,
      error: message,
      evaluator: null,
      implicitEvaluator: null,
      node: null
    };
  }
}

function prepareImplicit(input: string, left: string, right: string): PreparedMath {
  try {
    const node = math.parse(`(${left}) - (${right})`);
    const validationError = validateNode(node, IMPLICIT_ALLOWED_SYMBOLS);

    if (validationError) {
      return {
        mode: 'implicit',
        normalizedInput: input,
        latex: input,
        error: validationError,
        evaluator: null,
        implicitEvaluator: null,
        node: null
      };
    }

    const compiled = node.compile();
    const implicitEvaluator = (x: number, y: number): number | null => {
      try {
        const value = compiled.evaluate({ x, y });
        return toFiniteNumber(value);
      } catch {
        return null;
      }
    };

    return {
      mode: 'implicit',
      normalizedInput: input,
      latex: input,
      error: null,
      evaluator: null,
      implicitEvaluator,
      node
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse expression.';
    return {
      mode: 'implicit',
      normalizedInput: input,
      latex: input,
      error: message,
      evaluator: null,
      implicitEvaluator: null,
      node: null
    };
  }
}

export function prepareMath(rawInput: string): PreparedMath {
  const normalizedInput = normalizeInput(rawInput);

  if (!normalizedInput) {
    return {
      mode: 'explicit',
      normalizedInput,
      latex: null,
      error: null,
      evaluator: null,
      implicitEvaluator: null,
      node: null
    };
  }

  const equalityParts = normalizedInput.split('=');

  if (equalityParts.length === 2) {
    const left = equalityParts[0].trim();
    const right = equalityParts[1].trim();

    if (!left || !right) {
      return {
        mode: 'implicit',
        normalizedInput,
        latex: normalizedInput,
        error: 'Both sides of the equation must be non-empty.',
        evaluator: null,
        implicitEvaluator: null,
        node: null
      };
    }

    const rightUsesY = /\by\b/.test(right);
    const leftUsesY = /\by\b/.test(left);

    if (left === 'y' && !rightUsesY) {
      return prepareExplicit(right);
    }

    if (right === 'y' && !leftUsesY) {
      return prepareExplicit(left);
    }

    return prepareImplicit(normalizedInput, left, right);
  }

  if (equalityParts.length > 2) {
    return {
      mode: 'implicit',
      normalizedInput,
      latex: normalizedInput,
      error: 'Use exactly one equals sign in an equation.',
      evaluator: null,
      implicitEvaluator: null,
      node: null
    };
  }

  return prepareExplicit(normalizedInput);
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

interface SegmentPoint {
  x: number;
  y: number;
}

function edgeIntersection(
  x1: number,
  y1: number,
  v1: number,
  x2: number,
  y2: number,
  v2: number
): SegmentPoint | null {
  if (!Number.isFinite(v1) || !Number.isFinite(v2)) {
    return null;
  }

  if (Math.abs(v1) < 1e-12 && Math.abs(v2) < 1e-12) {
    return null;
  }

  if (Math.abs(v1) < 1e-12) {
    return { x: x1, y: y1 };
  }

  if (Math.abs(v2) < 1e-12) {
    return { x: x2, y: y2 };
  }

  if ((v1 > 0 && v2 > 0) || (v1 < 0 && v2 < 0)) {
    return null;
  }

  const t = v1 / (v1 - v2);
  if (!Number.isFinite(t) || t < 0 || t > 1) {
    return null;
  }

  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1)
  };
}

export function sampleImplicitContours(
  evaluator: (x: number, y: number) => number | null,
  viewport: Viewport,
  samples: number,
  maxAbsValue = 1e8
): Point[][] {
  const resolution = Math.max(30, Math.min(180, Math.round(Math.sqrt(Math.max(1, samples)) * 2.2)));
  const nx = resolution;
  const ny = resolution;
  const dx = (viewport.xMax - viewport.xMin) / nx;
  const dy = (viewport.yMax - viewport.yMin) / ny;

  const values: number[][] = Array.from({ length: ny + 1 }, () => Array.from({ length: nx + 1 }, () => NaN));

  for (let iy = 0; iy <= ny; iy += 1) {
    const y = viewport.yMin + iy * dy;
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = viewport.xMin + ix * dx;
      const value = evaluator(x, y);
      values[iy][ix] = value === null || !Number.isFinite(value) || Math.abs(value) > maxAbsValue ? NaN : value;
    }
  }

  const segments: Point[][] = [];

  for (let iy = 0; iy < ny; iy += 1) {
    const y0 = viewport.yMin + iy * dy;
    const y1 = y0 + dy;

    for (let ix = 0; ix < nx; ix += 1) {
      const x0 = viewport.xMin + ix * dx;
      const x1 = x0 + dx;

      const v00 = values[iy][ix];
      const v10 = values[iy][ix + 1];
      const v11 = values[iy + 1][ix + 1];
      const v01 = values[iy + 1][ix];

      const intersections: SegmentPoint[] = [];

      const bottom = edgeIntersection(x0, y0, v00, x1, y0, v10);
      const right = edgeIntersection(x1, y0, v10, x1, y1, v11);
      const top = edgeIntersection(x1, y1, v11, x0, y1, v01);
      const left = edgeIntersection(x0, y1, v01, x0, y0, v00);

      if (bottom) intersections.push(bottom);
      if (right) intersections.push(right);
      if (top) intersections.push(top);
      if (left) intersections.push(left);

      if (intersections.length === 2) {
        segments.push([intersections[0], intersections[1]]);
      } else if (intersections.length === 4) {
        const centerValue = evaluator((x0 + x1) / 2, (y0 + y1) / 2);
        if (centerValue !== null && Number.isFinite(centerValue)) {
          if (centerValue > 0) {
            segments.push([intersections[0], intersections[3]]);
            segments.push([intersections[1], intersections[2]]);
          } else {
            segments.push([intersections[0], intersections[1]]);
            segments.push([intersections[2], intersections[3]]);
          }
        }
      }
    }
  }

  return segments;
}

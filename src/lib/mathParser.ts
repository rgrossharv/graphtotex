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
  maxAbsY = 1e6,
  resolution = { width: 1000, height: 750 }
): Point[][] {
  const clampedSamples = Math.max(32, Math.min(5000, Math.round(samples)));
  const segments: Point[][] = [];
  let currentSegment: Point[] = [];
  const ySpan = Math.max(1e-6, viewport.yMax - viewport.yMin);
  const clipMin = Math.max(viewport.yMin - ySpan * 0.1, Math.min(viewport.yMin, -maxAbsY));
  const clipMax = Math.min(viewport.yMax + ySpan * 0.1, Math.max(viewport.yMax, maxAbsY));
  const tolerance = ySpan * 0.45 / Math.max(1, resolution.height);
  let refinementsLeft = Math.max(2048, Math.min(20000, clampedSamples * 8));
  const finishSegment = () => {
    if (currentSegment.length > 1) segments.push(currentSegment);
    currentSegment = [];
  };
  const evaluate = (x: number): Point | null => {
    const y = evaluator(x);
    return y === null || !Number.isFinite(y) ? null : { x, y };
  };
  const appendEdge = (a: Point, b: Point) => {
    // Clip in world coordinates before sending points to canvas or TikZ. Very
    // steep continuous lines still reach the canvas edges without huge coordinates.
    const scale = Math.max(1, Math.abs(a.y), Math.abs(b.y));
    const delta = b.y / scale - a.y / scale;
    let enter = 0, exit = 1;
    if (delta === 0) {
      if (a.y < clipMin || a.y > clipMax) { finishSegment(); return; }
    } else {
      const first = (clipMin / scale - a.y / scale) / delta;
      const second = (clipMax / scale - a.y / scale) / delta;
      enter = Math.max(0, Math.min(first, second));
      exit = Math.min(1, Math.max(first, second));
      if (enter > exit) { finishSegment(); return; }
    }
    const interpolate = (t: number): Point => t === 0 ? a : t === 1 ? b : ({
      x: a.x + (b.x - a.x) * t,
      y: Math.max(clipMin, Math.min(clipMax, (a.y / scale * (1 - t) + b.y / scale * t) * scale))
    });
    const start = interpolate(enter), end = interpolate(exit);
    const previous = currentSegment[currentSegment.length - 1];
    if (previous && (Math.abs(previous.x - start.x) > (xMax - xMin) * 1e-12 || Math.abs(previous.y - start.y) > ySpan * 1e-10)) finishSegment();
    if (!currentSegment.length) currentSegment.push(start);
    currentSegment.push(end);
    if (exit < 1) finishSegment();
  };
  const refine = (aX: number, a: Point | null, bX: number, b: Point | null, depth: number) => {
    const middleX = aX + (bX - aX) / 2;
    if (middleX === aX || middleX === bX) { finishSegment(); return; }
    const middle = evaluate(middleX);
    const canRefine = depth < 18 && refinementsLeft > 0;
    if (!a || !b || !middle) {
      // Refine a domain boundary when at least one sample is defined.
      if (canRefine && (a || b || middle)) {
        refinementsLeft--;
        refine(aX, a, middleX, middle, depth + 1);
        refine(middleX, middle, bX, b, depth + 1);
      } else finishSegment();
      return;
    }
    const roundoff = Math.max(1, Math.abs(a.y), Math.abs(b.y), Math.abs(middle.y)) * 1e-12;
    const turns = middle.y < Math.min(a.y, b.y) - roundoff || middle.y > Math.max(a.y, b.y) + roundoff;
    const offscreen = Math.min(a.y, b.y, middle.y) > clipMax || Math.max(a.y, b.y, middle.y) < clipMin;
    if (offscreen && !turns) { finishSegment(); return; }
    const error = Math.abs(middle.y - (a.y / 2 + b.y / 2));
    const pixelSpan = (bX - aX) / Math.max(1e-12, xMax - xMin) * resolution.width;
    if (turns || error > tolerance || pixelSpan > 12) {
      if (canRefine) {
        refinementsLeft--;
        refine(aX, a, middleX, middle, depth + 1);
        refine(middleX, middle, bX, b, depth + 1);
      } else {
        // A pole continues to turn or diverge as the interval shrinks. Break
        // the path instead of drawing a false line through the asymptote.
        finishSegment();
      }
      return;
    }
    appendEdge(a, b);
  };
  let aX = xMin;
  let a = evaluate(aX);
  for (let i = 1; i <= clampedSamples; i++) {
    const bX = xMin + i / clampedSamples * (xMax - xMin);
    const b = evaluate(bX);
    refine(aX, a, bX, b, 0);
    aX = bX; a = b;
  }
  finishSegment();
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
  v2: number,
  evaluator: (x: number, y: number) => number | null
): SegmentPoint | null {
  if (!Number.isFinite(v1) || !Number.isFinite(v2)) {
    return null;
  }

  if (v1 === 0 && v2 === 0) {
    return null;
  }

  if (v1 === 0) {
    return { x: x1, y: y1 };
  }

  if (v2 === 0) {
    return { x: x2, y: y2 };
  }

  if ((v1 > 0 && v2 > 0) || (v1 < 0 && v2 < 0)) {
    return null;
  }

  const t = v1 / (v1 - v2);
  if (!Number.isFinite(t) || t < 0 || t > 1) {
    return null;
  }

  // A sign change can also be a pole (e.g. 1/x = 0). Refine the root and
  // require a smaller residual before accepting an intersection.
  let low = 0, high = 1, lowValue = v1;
  let best: SegmentPoint | null = null;
  let bestResidual = Infinity;
  const baseline = Math.min(Math.abs(v1), Math.abs(v2));
  for (let iteration = 0; iteration < 18; iteration++) {
    const fraction = iteration === 0 ? t : (low + high) / 2;
    const point = { x: x1 + fraction * (x2 - x1), y: y1 + fraction * (y2 - y1) };
    const value = evaluator(point.x, point.y);
    if (value === null || !Number.isFinite(value)) return null;
    const residual = Math.abs(value);
    if (residual < bestResidual) { best = point; bestResidual = residual; }
    if (residual === 0 || residual <= baseline * 1e-6) return point;
    if ((value > 0) === (lowValue > 0)) { low = fraction; lowValue = value; }
    else high = fraction;
  }
  return bestResidual <= baseline * 0.02 ? best : null;
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

      const bottom = edgeIntersection(x0, y0, v00, x1, y0, v10, evaluator);
      const right = edgeIntersection(x1, y0, v10, x1, y1, v11, evaluator);
      const top = edgeIntersection(x1, y1, v11, x0, y1, v01, evaluator);
      const left = edgeIntersection(x0, y1, v01, x0, y0, v00, evaluator);

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

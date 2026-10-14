import type { MathNode, OperatorNode, ParenthesisNode, SymbolNode } from 'mathjs';
import type { Point, PreparedExpression, Viewport } from '../types';
import { formatNumber } from './formatting';
import { sampleImplicitContours } from './mathParser';

interface Affine { x: number; y: number; constant: number }

function affine(node: MathNode): Affine | null {
  if (node.type === 'ParenthesisNode') return affine((node as ParenthesisNode).content);
  if (node.type === 'SymbolNode') {
    const name = (node as SymbolNode).name;
    if (name === 'x') return { x: 1, y: 0, constant: 0 };
    if (name === 'y') return { x: 0, y: 1, constant: 0 };
  }
  if (!node.filter((child) => child.type === 'SymbolNode' && ['x', 'y'].includes((child as SymbolNode).name)).length) {
    try {
      const value: unknown = node.compile().evaluate();
      return typeof value === 'number' && Number.isFinite(value) ? { x: 0, y: 0, constant: value } : null;
    } catch { return null; }
  }
  if (node.type !== 'OperatorNode') return null;
  const { fn, args } = node as OperatorNode;
  const left = affine(args[0]);
  if (!left) return null;
  const multiply = (a: Affine, factor: number): Affine => ({ x: a.x * factor, y: a.y * factor, constant: a.constant * factor });
  if (args.length === 1) return fn === 'unaryMinus' ? multiply(left, -1) : fn === 'unaryPlus' ? left : null;
  if (args.length !== 2) return null;
  const right = affine(args[1]);
  if (!right) return null;
  if (fn === 'add' || fn === 'subtract') {
    const sign = fn === 'add' ? 1 : -1;
    return { x: left.x + sign * right.x, y: left.y + sign * right.y, constant: left.constant + sign * right.constant };
  }
  if (fn === 'multiply') {
    if (left.x === 0 && left.y === 0) return multiply(right, left.constant);
    if (right.x === 0 && right.y === 0) return multiply(left, right.constant);
  }
  if (fn === 'divide' && right.x === 0 && right.y === 0 && right.constant !== 0) return multiply(left, 1 / right.constant);
  return null;
}

function clipLine(line: Affine, viewport: Viewport): Point[] {
  const points: Point[] = [];
  const epsilon = Math.max(viewport.xMax - viewport.xMin, viewport.yMax - viewport.yMin) * 1e-9;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < viewport.xMin - epsilon || x > viewport.xMax + epsilon || y < viewport.yMin - epsilon || y > viewport.yMax + epsilon) return;
    const point = { x: Math.max(viewport.xMin, Math.min(viewport.xMax, x)), y: Math.max(viewport.yMin, Math.min(viewport.yMax, y)) };
    if (!points.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < epsilon)) points.push(point);
  };
  if (line.y !== 0) {
    for (const x of [viewport.xMin, viewport.xMax]) add(x, -(line.x * x + line.constant) / line.y);
  }
  if (line.x !== 0) {
    for (const y of [viewport.yMin, viewport.yMax]) add(-(line.y * y + line.constant) / line.x, y);
  }
  return points;
}

// Join marching-squares edges so dash patterns continue along a whole contour.
// Branches remain separate, and disconnected curves are never joined.
export function joinContourSegments(segments: Point[][], viewport: Viewport): Point[][] {
  const tolerance = 1e-7;
  const xSpan = viewport.xMax - viewport.xMin, ySpan = viewport.yMax - viewport.yMin;
  const nodes: { point: Point; edges: number[]; nx: number; ny: number }[] = [];
  const buckets = new Map<string, number[]>();
  const edges: { a: number; b: number; visited: boolean }[] = [];
  const seenEdges = new Set<string>();
  const nodeIndex = (point: Point): number => {
    const nx = (point.x - viewport.xMin) / xSpan, ny = (point.y - viewport.yMin) / ySpan;
    const bx = Math.floor(nx / tolerance), by = Math.floor(ny / tolerance);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const index of buckets.get(`${bx + dx},${by + dy}`) || []) {
        const other = nodes[index];
        if (Math.abs(other.nx - nx) <= tolerance && Math.abs(other.ny - ny) <= tolerance) return index;
      }
    }
    const index = nodes.length, key = `${bx},${by}`;
    nodes.push({ point, edges: [], nx, ny }); buckets.set(key, [...(buckets.get(key) || []), index]);
    return index;
  };
  for (const segment of segments) for (let i = 1; i < segment.length; i++) {
    const a = nodeIndex(segment[i - 1]), b = nodeIndex(segment[i]);
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (a === b || seenEdges.has(key)) continue;
    seenEdges.add(key);
    const index = edges.length; edges.push({ a, b, visited: false });
    nodes[a].edges.push(index); nodes[b].edges.push(index);
  }
  const paths: Point[][] = [];
  const walk = (start: number, firstEdge: number) => {
    const path = [nodes[start].point];
    let node = start, edgeIndex: number | undefined = firstEdge;
    while (edgeIndex !== undefined && !edges[edgeIndex].visited) {
      const edge: { a: number; b: number; visited: boolean } = edges[edgeIndex];
      edge.visited = true; node = edge.a === node ? edge.b : edge.a; path.push(nodes[node].point);
      if (node === start || nodes[node].edges.length !== 2) break;
      edgeIndex = nodes[node].edges.find((index) => !edges[index].visited);
    }
    if (path.length > 1) paths.push(path);
  };
  nodes.forEach((node, index) => {
    if (node.edges.length !== 2) node.edges.forEach((edge) => { if (!edges[edge].visited) walk(index, edge); });
  });
  edges.forEach((edge, index) => { if (!edge.visited) walk(edge.a, index); });
  return paths;
}

function coordinate(point: Point): string { return `(${formatNumber(point.x)},${formatNumber(point.y)})`; }

export function exportExplicitLine(expr: PreparedExpression, viewport: Viewport, style: string): string[] | null {
  if (!expr.node) return null;
  const coefficients = affine(expr.node);
  if (!coefficients || coefficients.y !== 0 || !Object.values(coefficients).every(Number.isFinite)) return null;
  const points = clipLine({ x: -coefficients.x, y: 1, constant: -coefficients.constant }, viewport);
  return points.length < 2 ? [`% Skipped ${expr.rawInput}: line is outside viewport or domain.`]
    : [`\\draw[${style}] ${coordinate(points[0])} -- ${coordinate(points[1])};`];
}

export function exportImplicitExpression(expr: PreparedExpression, viewport: Viewport, style: string): string[] {
  if (!expr.implicitEvaluator || !expr.node) return [];
  const line = affine(expr.node);
  if (line && Object.values(line).every(Number.isFinite)) {
    if (line.x === 0 && line.y === 0) return [line.constant === 0 ? '% This equation holds everywhere; it does not define a unique curve.' : '% This constant equation has no solutions.'];
    const points = clipLine(line, viewport);
    if (points.length < 2) return ['% Skipped implicit line: no line segment inside the viewport/domain.'];
    return [`\\draw[${style}] ${coordinate(points[0])} -- ${coordinate(points[1])};`];
  }
  const paths = joinContourSegments(sampleImplicitContours(expr.implicitEvaluator, viewport, expr.samples), viewport);
  if (!paths.length) return ['% No implicit contour found inside the viewport/domain at the current sample density.'];
  return [
    `% Implicit equation: ${expr.rawInput.replace(/[\r\n]/g, ' ')} (sampled contours).`,
    ...paths.map((path) => `\\draw[${style}] plot coordinates {${path.map(coordinate).join(' ')}};`)
  ];
}

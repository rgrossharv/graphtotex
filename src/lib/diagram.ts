import type { Point } from '../types';

export type ArrowStyle = 'arrow' | 'inclusion' | 'twohead' | 'both' | 'none';
export interface DiagramNode {
  id: string;
  label: string;
  column: number;
  row: number;
}
export interface DiagramArrow {
  id: string;
  from: string;
  to: string;
  label: string;
  style: ArrowStyle;
  dashed: boolean;
  bend: number;
  labelSide: 'left' | 'right';
  color: string;
}
export interface Diagram {
  nodes: DiagramNode[];
  arrows: DiagramArrow[];
  columns: number;
  rows: number;
}
export type DiagramNodeSizes = Record<string, { width: number; height: number }>;
export type DiagramTemplate = 'square' | 'triangle' | 'sequence' | 'blank';

export const CELL_WIDTH = 180;
export const CELL_HEIGHT = 140;
export const BOARD_PADDING = 90;
export const DIAGRAM_STORAGE_KEY = 'graphtotex-diagram-v1';
export const ARROW_STYLES: { value: ArrowStyle; label: string }[] = [
  { value: 'arrow', label: '→  Standard arrow' },
  { value: 'inclusion', label: '↪  Inclusion' },
  { value: 'twohead', label: '↠  Two-headed arrow' },
  { value: 'both', label: '↔  Both directions' },
  { value: 'none', label: '—  Plain line' }
];

export function createDiagramArrow(from: string, to: string, label = ''): DiagramArrow {
  return { id: crypto.randomUUID(), from, to, label, style: 'arrow', dashed: false, bend: 0, labelSide: 'left', color: '#334155' };
}

export function diagramTemplate(template: DiagramTemplate): Diagram {
  const nodes: DiagramNode[] = [];
  const arrows: DiagramArrow[] = [];
  const addNode = (label: string, column: number, row: number) => {
    const id = crypto.randomUUID();
    nodes.push({ id, label, column, row });
    return id;
  };
  if (template === 'square') {
    const a = addNode('A', 0, 0), b = addNode('B', 2, 0);
    const c = addNode('C', 0, 2), d = addNode('D', 2, 2);
    arrows.push(createDiagramArrow(a, b, 'f'), createDiagramArrow(a, c, 'g'), createDiagramArrow(b, d, 'h'), createDiagramArrow(c, d, 'k'));
    arrows[1].labelSide = 'right';
  } else if (template === 'triangle') {
    const a = addNode('A', 0, 0), b = addNode('B', 2, 0), c = addNode('C', 1, 2);
    arrows.push(createDiagramArrow(a, b, 'f'), createDiagramArrow(a, c, 'g'), createDiagramArrow(b, c, 'h'));
    arrows[1].labelSide = 'right';
  } else if (template === 'sequence') {
    const ids = ['0', 'A', 'B', 'C', '0'].map((label, column) => addNode(label, column, 1));
    for (let i = 0; i < ids.length - 1; i++) arrows.push(createDiagramArrow(ids[i], ids[i + 1], i === 1 ? 'f' : i === 2 ? 'g' : ''));
  }
  return { nodes, arrows, columns: template === 'sequence' ? 5 : 3, rows: 3 };
}

export function nodePoint(node: DiagramNode): Point {
  return { x: BOARD_PADDING + node.column * CELL_WIDTH, y: BOARD_PADDING + node.row * CELL_HEIGHT };
}

export function arrowGeometry(from: DiagramNode, to: DiagramNode, arrow: DiagramArrow, sizes: DiagramNodeSizes = {}) {
  const a = nodePoint(from), b = nodePoint(to);
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: dy / distance, y: -dx / distance };
  const offset = Math.tan(arrow.bend * Math.PI / 180) * distance * 0.5;
  const control = { x: (a.x + b.x) / 2 + normal.x * offset, y: (a.y + b.y) / 2 + normal.y * offset };
  const boundary = (center: Point, node: DiagramNode): Point => {
    const vx = control.x - center.x, vy = control.y - center.y;
    const size = sizes[node.id] ?? { width: 120, height: 68 };
    const factor = Math.min(size.width / 2 / (Math.abs(vx) || 1e-9), size.height / 2 / (Math.abs(vy) || 1e-9));
    return { x: center.x + vx * factor, y: center.y + vy * factor };
  };
  const start = boundary(a, from), end = boundary(b, to);
  const control1 = { x: start.x + (control.x - start.x) * 2 / 3, y: start.y + (control.y - start.y) * 2 / 3 };
  const control2 = { x: end.x + (control.x - end.x) * 2 / 3, y: end.y + (control.y - end.y) * 2 / 3 };
  const side = arrow.labelSide === 'left' ? 1 : -1;
  const label = { x: (start.x + 2 * control.x + end.x) / 4 + normal.x * 23 * side, y: (start.y + 2 * control.y + end.y) / 4 + normal.y * 23 * side };
  return { start, end, control1, control2, label,
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}` };
}

// Validate saved drafts before using them in the editor or exporter.
export function isDiagram(value: unknown): value is Diagram {
  if (!value || typeof value !== 'object') return false;
  const d = value as Diagram;
  if (!Number.isInteger(d.columns) || d.columns < 1 || d.columns > 8 || !Number.isInteger(d.rows) || d.rows < 1 || d.rows > 8 || !Array.isArray(d.nodes) || !Array.isArray(d.arrows)) return false;
  const ids = new Set<string>(), cells = new Set<string>();
  for (const n of d.nodes) {
    if (!n || typeof n.id !== 'string' || typeof n.label !== 'string' || ids.has(n.id) || !Number.isInteger(n.column) || n.column < 0 || n.column >= d.columns || !Number.isInteger(n.row) || n.row < 0 || n.row >= d.rows) return false;
    const cell = `${n.column},${n.row}`;
    if (cells.has(cell)) return false;
    ids.add(n.id); cells.add(cell);
  }
  const arrowIds = new Set<string>();
  return d.arrows.every((a) => {
    if (!a || typeof a.id !== 'string' || arrowIds.has(a.id) || !ids.has(a.from) || !ids.has(a.to) || a.from === a.to || typeof a.label !== 'string' || !ARROW_STYLES.some((s) => s.value === a.style) || typeof a.dashed !== 'boolean' || !Number.isFinite(a.bend) || Math.abs(a.bend) > 50 || !['left', 'right'].includes(a.labelSide) || typeof a.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(a.color)) return false;
    arrowIds.add(a.id);
    return true;
  });
}

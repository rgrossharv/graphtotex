export type ArrowHead = 'arrow' | 'none' | 'hook' | 'tail' | 'twoheads';
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'double';
export type LabelSide = 'left' | 'right' | 'on';
export type LoopSide = 'above' | 'right' | 'below' | 'left';

export interface DiagramNode {
  id: string;
  name: string;
  label: string;
  x: number;
  y: number;
}

export interface DiagramArrow {
  id: string;
  from: string;
  to: string;
  label: string;
  start: ArrowHead;
  end: ArrowHead;
  style: LineStyle;
  bend: number;
  labelSide: LabelSide;
  labelPosition: number;
  loopSide: LoopSide;
}

export interface Diagram {
  nodes: DiagramNode[];
  arrows: DiagramArrow[];
}

export interface DiagramFile extends Diagram {
  format: 'graphtotex-diagram';
  version: 1;
}

export const DIAGRAM_STORAGE_KEY = 'graphtotex-diagram-v1';
export const GRID_STEP = 0.5;
export const PIXELS_PER_CM = 60;

export function diagramId(): string {
  return crypto.randomUUID();
}

export function nextNodeName(nodes: DiagramNode[]): string {
  let index = 0;
  let name = 'A';
  while (nodes.some((node) => node.name === name)) {
    index += 1;
    name = index < 26 ? String.fromCharCode(65 + index) : `N${index + 1}`;
  }
  return name;
}

export function createNode(nodes: DiagramNode[], x: number, y: number, label?: string): DiagramNode {
  const name = nextNodeName(nodes);
  return { id: diagramId(), name, label: label ?? name, x, y };
}

export function createArrow(from: string, to: string, patch: Partial<DiagramArrow> = {}): DiagramArrow {
  return {
    id: diagramId(), from, to, label: '', start: 'none', end: 'arrow', style: 'solid',
    bend: 0, labelSide: 'left', labelPosition: 0.5, loopSide: 'above', ...patch
  };
}

export const PRESETS = [
  { key: 'square', name: 'Commutative square', description: 'Four objects, four maps', icon: 'square' },
  { key: 'triangle', name: 'Triangle', description: 'A composition or factorization', icon: 'triangle' },
  { key: 'pullback', name: 'Pullback', description: 'A universal map and projections', icon: 'pullback' },
  { key: 'exact', name: 'Short exact sequence', description: 'An inclusion and a surjection', icon: 'exact' },
  { key: 'parallel', name: 'Parallel arrows', description: 'Functors and a natural transformation', icon: 'parallel' },
  { key: 'cube', name: 'Commutative cube', description: 'Two squares and connecting maps', icon: 'cube' }
] as const;

export function diagramPreset(key: string): Diagram {
  const nodes: DiagramNode[] = [];
  const arrows: DiagramArrow[] = [];
  const n = (label: string, x: number, y: number) => {
    const node = createNode(nodes, x, y, label);
    nodes.push(node);
    return node.id;
  };
  const a = (from: string, to: string, label = '', patch: Partial<DiagramArrow> = {}) => {
    arrows.push(createArrow(from, to, { label, ...patch }));
  };
  if (key === 'triangle') {
    const A = n('A', -2, 1.5), B = n('B', 2, 1.5), C = n('C', 0, -1.5);
    a(A, B, 'f'); a(B, C, 'g'); a(A, C, 'g \\circ f', { labelSide: 'right' });
  } else if (key === 'exact') {
    const ids = ['0', 'A', 'B', 'C', '0'].map((label, i) => n(label, (i - 2) * 2.5, 0));
    a(ids[0], ids[1]); a(ids[1], ids[2], 'i', { start: 'hook' });
    a(ids[2], ids[3], 'p', { end: 'twoheads' }); a(ids[3], ids[4]);
  } else if (key === 'parallel') {
    const C = n('\\mathcal{C}', -2, 0), D = n('\\mathcal{D}', 2, 0);
    a(C, D, 'F', { bend: 28 }); a(C, D, 'G', { bend: -28, labelSide: 'right' });
  } else if (key === 'cube') {
    const labels = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];
    const coords = [[-3,1], [1,1], [-3,-2], [1,-2], [-1.5,2.5], [2.5,2.5], [-1.5,-0.5], [2.5,-0.5]];
    const ids = labels.map((label, i) => n(label, coords[i][0], coords[i][1]));
    [[4,5], [4,6], [5,7], [6,7], [0,1], [0,2], [1,3], [2,3], [0,4], [1,5], [2,6], [3,7]]
      .forEach(([from, to], i) => a(ids[from], ids[to], '', { style: [1,3,10].includes(i) ? 'dashed' : 'solid' }));
  } else if (key === 'pullback') {
    const P = n('P', -2, 1.5), X = n('X', 2, 1.5), Y = n('Y', -2, -1.5), Z = n('Z', 2, -1.5);
    const Q = n('Q', -4, 3.5);
    a(P, X, 'p_X'); a(P, Y, 'p_Y', { labelSide: 'right' }); a(X, Z, 'f'); a(Y, Z, 'g', { labelSide: 'right' });
    a(Q, P, '\\exists!\\,u', { style: 'dashed' });
    a(Q, X, '\\alpha', { bend: 25 }); a(Q, Y, '\\beta', { bend: -25, labelSide: 'right' });
  } else if (key === 'square') {
    const A = n('A', -2, 1.5), B = n('B', 2, 1.5), C = n('C', -2, -1.5), D = n('D', 2, -1.5);
    a(A, B, 'f'); a(A, C, 'g', { labelSide: 'right' }); a(B, D, 'h'); a(C, D, 'k', { labelSide: 'right' });
  }
  return { nodes, arrows };
}

// Accept both bare math and labels pasted with their math delimiters.
export function mathLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) return trimmed.slice(1, -1).trim();
  if ((trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) ||
      (trimmed.startsWith('\\[') && trimmed.endsWith('\\]'))) return trimmed.slice(2, -2).trim();
  return trimmed;
}

export function serializeDiagram(diagram: Diagram): string {
  return JSON.stringify({ format: 'graphtotex-diagram', version: 1, ...diagram } satisfies DiagramFile, null, 2);
}

// Import is all-or-nothing: invalid files never replace the current diagram.
export function parseDiagramFile(text: string): Diagram {
  if (text.length > 2_000_000) throw new Error('This file is too large. Choose a diagram under 2 MB.');
  const data = JSON.parse(text) as DiagramFile;
  if (!data || data.format !== 'graphtotex-diagram' || data.version !== 1 ||
      !Array.isArray(data.nodes) || !Array.isArray(data.arrows) || data.nodes.length > 500 || data.arrows.length > 2000) {
    throw new Error('Choose a diagram JSON file saved by GraphToTeX.');
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  const isString = (value: unknown): value is string => typeof value === 'string' && value.length <= 5000;
  const numberIn = (value: unknown, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const nodes = data.nodes.map((node) => {
    if (!node || !isString(node.id) || !node.id || ids.has(node.id) || !isString(node.name) ||
        !/^[A-Za-z][A-Za-z0-9_-]*$/.test(node.name) || names.has(node.name) || !isString(node.label) ||
        !numberIn(node.x, -1000, 1000) || !numberIn(node.y, -1000, 1000)) {
      throw new Error('The file contains an invalid object or duplicate object name.');
    }
    ids.add(node.id); names.add(node.name);
    return { id: node.id, name: node.name, label: node.label, x: node.x, y: node.y };
  });
  const arrowIds = new Set<string>();
  const arrows = data.arrows.map((arrow) => {
    if (!arrow || !isString(arrow.id) || !arrow.id || arrowIds.has(arrow.id) || !ids.has(arrow.from) || !ids.has(arrow.to) ||
        !isString(arrow.label) || !['arrow', 'none', 'hook', 'tail', 'twoheads'].includes(arrow.start) ||
        !['arrow', 'none', 'hook', 'tail', 'twoheads'].includes(arrow.end) ||
        !['solid', 'dashed', 'dotted', 'double'].includes(arrow.style) || !numberIn(arrow.bend, -80, 80) ||
        !numberIn(arrow.labelPosition, 0.1, 0.9) || !['left', 'right', 'on'].includes(arrow.labelSide) ||
        !['above', 'right', 'below', 'left'].includes(arrow.loopSide)) {
      throw new Error('The file contains an invalid arrow or a missing endpoint.');
    }
    arrowIds.add(arrow.id);
    return {
      id: arrow.id, from: arrow.from, to: arrow.to, label: arrow.label, start: arrow.start,
      end: arrow.end, style: arrow.style, bend: arrow.bend, labelSide: arrow.labelSide,
      labelPosition: arrow.labelPosition, loopSide: arrow.loopSide
    };
  });
  return { nodes, arrows };
}

export function loadDiagram(): Diagram {
  try {
    const saved = localStorage.getItem(DIAGRAM_STORAGE_KEY);
    if (saved) return parseDiagramFile(saved);
  } catch { /* Storage can be disabled or contain an older file. */ }
  return diagramPreset('square');
}

import { arrowGeometry, BOARD_PADDING, nodePoint, type Diagram, type ArrowStyle, type DiagramNodeSizes } from './diagram';
import { formatNumber } from './formatting';
import type { Point } from '../types';

const ARROW_TIPS: Record<ArrowStyle, string> = {
  arrow: 'arrows={-Stealth}',
  inclusion: 'arrows={Hooks[right]-Stealth}',
  twohead: 'arrows={-Stealth[sep=1.5pt] Stealth}',
  both: 'arrows={Stealth-Stealth}',
  none: 'arrows={-}'
};

function coordinate(point: Point): string {
  return `(${formatNumber((point.x - BOARD_PADDING) / 80)},${formatNumber(-(point.y - BOARD_PADDING) / 80)})`;
}

function color(hex: string): string {
  return `{rgb,255:red,${parseInt(hex.slice(1, 3), 16)};green,${parseInt(hex.slice(3, 5), 16)};blue,${parseInt(hex.slice(5, 7), 16)}}`;
}

export function generateDiagramTikz(diagram: Diagram, scale = 1.2, sizes: DiagramNodeSizes = {}): string {
  const lines = [
    '% GraphToTeX commutative diagram',
    '% Required: \\usepackage{tikz} and \\usetikzlibrary{arrows.meta}',
    '% For labels such as \\mathbb{Z}, also load \\usepackage{amssymb}.',
    '\\begin{center}',
    `\\begin{tikzpicture}[scale=${formatNumber(scale)}, line cap=round, line join=round]`
  ];
  const names = new Map(diagram.nodes.map((node, i) => [node.id, `object${i + 1}`]));
  diagram.nodes.forEach((node) => {
    lines.push(`\\node[inner sep=2pt] (${names.get(node.id)}) at ${coordinate(nodePoint(node))} {$${node.label}$};`);
  });
  diagram.arrows.forEach((arrow) => {
    const from = diagram.nodes.find((n) => n.id === arrow.from);
    const to = diagram.nodes.find((n) => n.id === arrow.to);
    if (!from || !to || from.id === to.id) return;
    const geometry = arrowGeometry(from, to, arrow, sizes);
    const style = `${ARROW_TIPS[arrow.style]}, draw=${color(arrow.color)}, line width=0.65pt${arrow.dashed ? ', dashed' : ''}`;
    lines.push(`\\draw[${style}] ${coordinate(geometry.start)} .. controls ${coordinate(geometry.control1)} and ${coordinate(geometry.control2)} .. ${coordinate(geometry.end)};`);
    if (arrow.label.trim()) {
      lines.push(`\\node[inner sep=1.5pt, fill=white, text=${color(arrow.color)}] at ${coordinate(geometry.label)} {$${arrow.label}$};`);
    }
  });
  return [...lines, '\\end{tikzpicture}', '\\end{center}'].join('\n');
}

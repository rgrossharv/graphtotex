import { CELL_HEIGHT, CELL_WIDTH, type Diagram, type DiagramArrow } from './diagram';
import { formatNumber } from './formatting';

function color(hex: string): string {
  return `{rgb,255:red,${parseInt(hex.slice(1, 3), 16)};green,${parseInt(hex.slice(3, 5), 16)};blue,${parseInt(hex.slice(5, 7), 16)}}`;
}

function arrowToTikzCd(arrow: DiagramArrow, diagram: Diagram): string | null {
  const from = diagram.nodes.find((node) => node.id === arrow.from);
  const to = diagram.nodes.find((node) => node.id === arrow.to);
  if (!from || !to || from.id === to.id) return null;
  const options = [
    `from=${from.row + 1}-${from.column + 1}`,
    `to=${to.row + 1}-${to.column + 1}`,
    `color=${color(arrow.color)}`,
    'line width=0.65pt'
  ];
  if (arrow.label.trim()) options.push(`"{${arrow.label}}"${arrow.labelSide === 'right' ? "'" : ''}`);
  if (arrow.bend > 0) options.push(`bend left=${formatNumber(arrow.bend)}`);
  else if (arrow.bend < 0) options.push(`bend right=${formatNumber(-arrow.bend)}`);
  if (arrow.dashed) options.push('dashed');
  switch (arrow.style) {
    case 'inclusion': options.push('hook'); break;
    case 'twohead': options.push('two heads'); break;
    case 'both': options.push('leftrightarrow'); break;
    case 'none': options.push('dash'); break;
  }
  return `\\arrow[${options.join(', ')}]`;
}

// Native matrix and arrow syntax, independent of the coordinate-based TikZ engine.
export function generateDiagramTikzCd(diagram: Diagram, scale = 1.2): string {
  const rows = Array.from({ length: diagram.rows }, (_, row) => {
    const cells = Array.from({ length: diagram.columns }, (_, column) => {
      const node = diagram.nodes.find((item) => item.row === row && item.column === column);
      if (!node) return '{}';
      const arrows = diagram.arrows.filter((arrow) => arrow.from === node.id)
        .map((arrow) => arrowToTikzCd(arrow, diagram)).filter(Boolean);
      return [`{${node.label}}`, ...arrows].join(' ');
    });
    return `  ${cells.join(' \\& ')}${row < diagram.rows - 1 ? ' \\\\' : ''}`;
  });
  return [
    '% GraphToTeX commutative diagram (TikZ-CD)',
    '% Required: \\usepackage{tikz-cd} and \\usepackage{amsmath,amssymb}.',
    `% Diagram scale=${formatNumber(scale)}; spacing is measured between cell centers.`,
    '\\begin{center}',
    `\\begin{tikzcd}[ampersand replacement=\\&, row sep={${formatNumber(CELL_HEIGHT / 80 * scale)}cm,between origins}, column sep={${formatNumber(CELL_WIDTH / 80 * scale)}cm,between origins}]`,
    ...rows, '\\end{tikzcd}', '\\end{center}'
  ].join('\n');
}

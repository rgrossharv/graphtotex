import { mathLabel, type ArrowHead, type Diagram, type DiagramArrow } from './diagram';

function number(value: number): string {
  return String(Number(value.toFixed(3)));
}

function tip(head: ArrowHead): string {
  switch (head) {
    case 'arrow': return '>'; // The picture uses Latex tips by default.
    case 'hook': return '{Hooks[reversed]}';
    case 'tail': return '|';
    case 'twoheads': return '>>';
    default: return '';
  }
}

function arrowStyle(arrow: DiagramArrow): string {
  const options: string[] = [];
  if (arrow.start !== 'none' || arrow.end !== 'none') options.push(`${tip(arrow.start)}-${tip(arrow.end)}`);
  if (arrow.style === 'double') options.push('double', 'double distance=1.5pt');
  else if (arrow.style !== 'solid') options.push(arrow.style);
  return options.length ? `[${options.join(', ')}]` : '';
}

export function generateDiagramTikz(diagram: Diagram, standalone = false): string {
  const lines = ['\\begin{tikzpicture}[>=Latex, every node/.style={inner sep=2pt}]'];
  for (const node of diagram.nodes) {
    lines.push(`  \\node (${node.name}) at (${number(node.x)}, ${number(node.y)}) {$${mathLabel(node.label)}$};`);
  }
  if (diagram.nodes.length && diagram.arrows.length) lines.push('');
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  for (const arrow of diagram.arrows) {
    const from = nodes.get(arrow.from), to = nodes.get(arrow.to);
    if (!from || !to) continue;
    const options: string[] = [];
    if (arrow.from === arrow.to) options.push(`loop ${arrow.loopSide}`, 'min distance=12mm');
    else if (arrow.bend !== 0) options.push(`bend ${arrow.bend > 0 ? 'left' : 'right'}=${number(Math.abs(arrow.bend))}`);
    const label = mathLabel(arrow.label);
    let labelCode = '';
    if (label) {
      const placement = [arrow.labelPosition === 0.5 ? 'midway' : `pos=${number(arrow.labelPosition)}`];
      if (arrow.labelSide !== 'on') {
        placement.push('auto');
        if (arrow.labelSide === 'right') placement.push('swap');
      } else {
        placement.push('fill=white', 'inner sep=1pt');
      }
      labelCode = ` node[${placement.join(', ')}] {$${label}$}`;
    }
    const path = options.length ? `to[${options.join(', ')}]` : 'to';
    lines.push(`  \\draw${arrowStyle(arrow)} (${from.name}) ${path}${labelCode} (${to.name});`);
  }
  lines.push('\\end{tikzpicture}');
  const picture = lines.join('\n');
  if (!standalone) return picture;
  return [
    '\\documentclass[tikz,border=5pt]{standalone}', '\\usepackage{amsmath,amssymb}',
    '\\usetikzlibrary{arrows.meta}', '', '\\begin{document}', picture, '\\end{document}', ''
  ].join('\n');
}

export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Keep the URL alive until the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

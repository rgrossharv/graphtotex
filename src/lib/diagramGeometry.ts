import { PIXELS_PER_CM, type DiagramArrow, type DiagramNode } from './diagram';

export interface Vec { x: number; y: number }
export interface NodeSize { width: number; height: number }
export interface ArrowGeometry {
  path: string;
  label: Vec;
  start: Vec;
  end: Vec;
  startAngle: number;
  endAngle: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export const nodePoint = (node: DiagramNode): Vec => ({ x: node.x * PIXELS_PER_CM, y: -node.y * PIXELS_PER_CM });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Vec, scale: number): Vec => ({ x: a.x * scale, y: a.y * scale });
const unit = (p: Vec): Vec => mul(p, 1 / (Math.hypot(p.x, p.y) || 1));
const rotate = (p: Vec, angle: number): Vec => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) });
const angle = (p: Vec) => Math.atan2(p.y, p.x) * 180 / Math.PI;
const pointText = (p: Vec) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

function border(center: Vec, toward: Vec, size: NodeSize): Vec {
  const direction = sub(toward, center);
  const factor = Math.min((size.width / 2 + 5) / (Math.abs(direction.x) || 1e-9),
    (size.height / 2 + 5) / (Math.abs(direction.y) || 1e-9));
  return add(center, mul(direction, Math.min(factor, 0.45)));
}

export function arrowGeometry(arrow: DiagramArrow, from: DiagramNode, to: DiagramNode,
  fromSize: NodeSize, toSize: NodeSize, labelSize: NodeSize): ArrowGeometry {
  const source = nodePoint(from), target = nodePoint(to);
  let start: Vec, end: Vec, c1: Vec, c2: Vec;
  if (from.id === to.id) {
    const direction = { above: { x: 0, y: -1 }, below: { x: 0, y: 1 }, right: { x: 1, y: 0 }, left: { x: -1, y: 0 } }[arrow.loopSide];
    const side = rotate(direction, Math.PI / 2);
    const radius = Math.max(fromSize.width, fromSize.height) / 2 + 12;
    start = border(source, add(source, add(mul(direction, radius), mul(side, -radius))), fromSize);
    end = border(source, add(source, add(mul(direction, radius), mul(side, radius))), fromSize);
    c1 = add(source, add(mul(direction, radius + 80), mul(side, -65)));
    c2 = add(source, add(mul(direction, radius + 80), mul(side, 65)));
  } else {
    const delta = sub(target, source);
    // TikZ's bend angle sets endpoint tangents relative to the line joining the objects.
    const bend = -arrow.bend * Math.PI / 180;
    const distance = Math.hypot(delta.x, delta.y);
    const controlLength = distance * 0.3915;
    const outgoing = rotate(unit(delta), bend);
    const incoming = rotate(unit(mul(delta, -1)), -bend);
    start = border(source, add(source, mul(outgoing, distance)), fromSize);
    end = border(target, add(target, mul(incoming, distance)), toSize);
    c1 = add(start, mul(outgoing, controlLength));
    c2 = add(end, mul(incoming, controlLength));
  }
  const t = arrow.labelPosition, u = 1 - t;
  const middle = add(add(mul(start, u ** 3), mul(c1, 3 * u * u * t)), add(mul(c2, 3 * u * t * t), mul(end, t ** 3)));
  const tangent = unit(add(add(mul(sub(c1, start), 3 * u * u), mul(sub(c2, c1), 6 * u * t)), mul(sub(end, c2), 3 * t * t)));
  const normal = { x: tangent.y, y: -tangent.x };
  const labelDistance = 8 + Math.abs(normal.x) * labelSize.width / 2 + Math.abs(normal.y) * labelSize.height / 2;
  const label = arrow.labelSide === 'on' ? middle : add(middle, mul(normal, labelDistance * (arrow.labelSide === 'left' ? 1 : -1)));
  const xs = [start.x, end.x, c1.x, c2.x, label.x - labelSize.width / 2, label.x + labelSize.width / 2];
  const ys = [start.y, end.y, c1.y, c2.y, label.y - labelSize.height / 2, label.y + labelSize.height / 2];
  return {
    path: `M ${pointText(start)} C ${pointText(c1)} ${pointText(c2)} ${pointText(end)}`,
    label, start, end, startAngle: angle(sub(start, c1)), endAngle: angle(sub(end, c2)),
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  };
}

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GRID_STEP, PIXELS_PER_CM, type ArrowHead, type Diagram, type DiagramNode } from '../lib/diagram';
import { arrowGeometry, nodePoint, type NodeSize, type Vec } from '../lib/diagramGeometry';
import DiagramMath from './DiagramMath';

export type DiagramTool = 'select' | 'connect' | 'object' | 'pan';
export type DiagramSelection = { kind: 'nodes'; ids: string[] } | { kind: 'arrow'; id: string } | null;

interface DiagramCanvasProps {
  diagram: Diagram;
  selection: DiagramSelection;
  tool: DiagramTool;
  source: string | null;
  grid: boolean;
  snap: boolean;
  fitVersion: number;
  onSelect: (selection: DiagramSelection) => void;
  onNodeClick: (id: string) => void;
  onAddNode: (x: number, y: number) => void;
  onMoveNodes: (positions: Map<string, Vec>) => void;
  onGestureEnd: (previous: Diagram) => void;
  onEditNode: () => void;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; screen: Vec; camera: Vec }
  | { kind: 'nodes'; pointerId: number; start: Vec; screen: Vec; nodes: DiagramNode[]; previous: Diagram; moved: boolean; clicked: string; shift: boolean };

function ArrowTip({ head, point, rotation, double }: { head: ArrowHead; point: Vec; rotation: number; double: boolean }) {
  if (head === 'none') return null;
  const shape = head === 'tail' ? <path d="M 0,-6 L 0,6" />
    : head === 'hook' ? <path d="M 0,0 C -1,-8 -10,-8 -10,-1" />
      : <><path d="M -9,-4.5 L 0,0 L -9,4.5" />{head === 'twoheads' && <path d="M -15,-4.5 L -6,0 L -15,4.5" />}</>;
  return <g transform={`translate(${point.x},${point.y}) rotate(${rotation})`} className="diagram-arrow-tip" strokeWidth={double ? 1.8 : 1.5}>{shape}</g>;
}

export default function DiagramCanvas({ diagram, selection, tool, source, grid, snap, fitVersion,
  onSelect, onNodeClick, onAddNode, onMoveNodes, onGestureEnd, onEditNode }: DiagramCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [sizes, setSizes] = useState<Record<string, NodeSize>>({});
  const latestSizes = useRef(sizes);
  latestSizes.current = sizes;
  const [cursor, setCursor] = useState<Vec | null>(null);
  const latest = useRef(diagram);
  latest.current = diagram;

  const measure = useCallback((id: string, width: number, height: number) => {
    setSizes((prev) => prev[id]?.width === width && prev[id]?.height === height ? prev : { ...prev, [id]: { width, height } });
  }, []);
  const nodeSize = (id: string) => sizes[id] ?? { width: 24, height: 30 };
  const labelSize = (id: string) => sizes[id] ?? { width: 20, height: 24 };

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    const nodes = latest.current.nodes;
    if (!nodes.length) { setCamera({ x: 0, y: 0, zoom: 1 }); return; }
    const getSize = (id: string) => latestSizes.current[id] ?? { width: 24, height: 30 };
    const xs = nodes.flatMap((node) => [node.x * PIXELS_PER_CM - getSize(node.id).width / 2,
      node.x * PIXELS_PER_CM + getSize(node.id).width / 2]);
    const ys = nodes.flatMap((node) => [-node.y * PIXELS_PER_CM - getSize(node.id).height / 2,
      -node.y * PIXELS_PER_CM + getSize(node.id).height / 2]);
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    for (const arrow of latest.current.arrows) {
      const from = nodeMap.get(arrow.from), to = nodeMap.get(arrow.to);
      if (!from || !to) continue;
      const bounds = arrowGeometry(arrow, from, to, getSize(from.id), getSize(to.id), getSize(arrow.id)).bounds;
      xs.push(bounds.minX, bounds.maxX); ys.push(bounds.minY, bounds.maxY);
    }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = maxX - minX + 120;
    const height = maxY - minY + 120;
    setCamera({ x: (minX + maxX) / 2, y: (minY + maxY) / 2,
      zoom: Math.max(0.15, Math.min(1.5, size.width / width, size.height / height)) });
  // Fit only when requested, not while dragging or changing labels.
  }, [size.width, size.height]);

  useEffect(() => { fit(); }, [fitVersion, fit]);

  const point = (clientX: number, clientY: number): Vec => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const transformed = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const zoomAt = useCallback((factor: number, location?: Vec) => {
    setCamera((prev) => {
      const zoom = Math.min(3, Math.max(0.15, prev.zoom * factor));
      const pivot = location ?? { x: prev.x, y: prev.y };
      return { x: pivot.x - (pivot.x - prev.x) * prev.zoom / zoom,
        y: pivot.y - (pivot.y - prev.y) * prev.zoom / zoom, zoom };
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.0015), point(event.clientX, event.clientY));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const startPan = (event: ReactPointerEvent) => {
    gesture.current = { kind: 'pan', pointerId: event.pointerId, screen: { x: event.clientX, y: event.clientY }, camera };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onBackgroundDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (tool === 'pan' || event.button === 1 || event.altKey) { startPan(event); return; }
    const location = point(event.clientX, event.clientY);
    if (tool === 'object') { onAddNode(location.x / PIXELS_PER_CM, -location.y / PIXELS_PER_CM); return; }
    onSelect(null);
    if (tool !== 'connect') startPan(event);
  };

  const onNodeDown = (event: ReactPointerEvent<SVGGElement>, node: DiagramNode) => {
    event.stopPropagation();
    if (tool === 'pan' || event.button === 1 || event.altKey) { startPan(event); return; }
    if (event.button !== 0) return;
    if (tool === 'connect') { onNodeClick(node.id); return; }
    const current = selection?.kind === 'nodes' ? selection.ids : [];
    if (event.shiftKey && current.includes(node.id)) {
      const ids = current.filter((id) => id !== node.id);
      onSelect(ids.length ? { kind: 'nodes', ids } : null);
      return;
    }
    const ids = event.shiftKey ? [...new Set([...current, node.id])] : current.includes(node.id) ? current : [node.id];
    onSelect({ kind: 'nodes', ids });
    gesture.current = { kind: 'nodes', pointerId: event.pointerId, start: point(event.clientX, event.clientY),
      screen: { x: event.clientX, y: event.clientY }, nodes: diagram.nodes.filter((item) => ids.includes(item.id)),
      previous: diagram, moved: false, clicked: node.id, shift: event.shiftKey };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const location = point(event.clientX, event.clientY);
    setCursor(location);
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.kind === 'pan') {
      setCamera((prev) => ({ ...prev, x: active.camera.x - (event.clientX - active.screen.x) / prev.zoom,
        y: active.camera.y - (event.clientY - active.screen.y) / prev.zoom }));
    } else {
      if (!active.moved && Math.hypot(event.clientX - active.screen.x, event.clientY - active.screen.y) < 4) return;
      active.moved = true;
      let dx = (location.x - active.start.x) / PIXELS_PER_CM, dy = -(location.y - active.start.y) / PIXELS_PER_CM;
      if (snap && !event.shiftKey) {
        const anchor = active.nodes.find((node) => node.id === active.clicked)!;
        dx = Math.round((anchor.x + dx) / GRID_STEP) * GRID_STEP - anchor.x;
        dy = Math.round((anchor.y + dy) / GRID_STEP) * GRID_STEP - anchor.y;
      }
      onMoveNodes(new Map(active.nodes.map((node) => [node.id, {
        x: Math.max(-1000, Math.min(1000, node.x + dx)), y: Math.max(-1000, Math.min(1000, node.y + dy))
      }])));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
    if (active.kind === 'nodes') {
      if (active.moved) onGestureEnd(active.previous);
      else if (!active.shift) onSelect({ kind: 'nodes', ids: [active.clicked] });
    }
  };

  const width = size.width / camera.zoom, height = size.height / camera.zoom;
  const viewBox = `${camera.x - width / 2} ${camera.y - height / 2} ${width} ${height}`;
  const sourceNode = diagram.nodes.find((node) => node.id === source);
  const selectedIds = selection?.kind === 'nodes' ? selection.ids : [];

  return (
    <div className="diagram-canvas-frame" ref={frameRef}>
      <svg ref={svgRef} className={`diagram-canvas tool-${tool}`} viewBox={viewBox}
        role="application" aria-label="Diagram canvas. Drag objects to move them. In Arrow mode, click a source and a target."
        tabIndex={0} onPointerDown={onBackgroundDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onLostPointerCapture={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget && !(event.target instanceof SVGRectElement && event.target.dataset.background)) return;
          const p = point(event.clientX, event.clientY);
          if (tool === 'select') onAddNode(p.x / PIXELS_PER_CM, -p.y / PIXELS_PER_CM);
        }}>
        <defs>
          <pattern id="diagram-grid" width={GRID_STEP * PIXELS_PER_CM} height={GRID_STEP * PIXELS_PER_CM} patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="1" className="diagram-grid-dot" />
          </pattern>
        </defs>
        <rect data-background="true" x={camera.x - width / 2} y={camera.y - height / 2} width={width} height={height} fill={grid ? 'url(#diagram-grid)' : 'transparent'} />
        {diagram.arrows.map((arrow) => {
          const from = diagram.nodes.find((node) => node.id === arrow.from), to = diagram.nodes.find((node) => node.id === arrow.to);
          if (!from || !to) return null;
          const geometry = arrowGeometry(arrow, from, to, nodeSize(from.id), nodeSize(to.id), labelSize(arrow.id));
          const selected = selection?.kind === 'arrow' && selection.id === arrow.id;
          const label = labelSize(arrow.id);
          return (
            <g key={arrow.id} data-arrow-id={arrow.id} className={`diagram-arrow ${selected ? 'is-selected' : ''}`}
              role="button" tabIndex={0} aria-label={`Arrow ${from.name} to ${to.name}${arrow.label ? `: ${arrow.label}` : ''}`}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect({ kind: 'arrow', id: arrow.id }); } }}
              onPointerDown={(event) => { event.stopPropagation(); if (tool === 'pan' || event.altKey || event.button === 1) startPan(event); else onSelect({ kind: 'arrow', id: arrow.id }); }}>
              <title>{`${from.label} → ${to.label}${arrow.label ? `: ${arrow.label}` : ''}`}</title>
              <path d={geometry.path} className="diagram-arrow-hit" />
              {selected && <path d={geometry.path} className="diagram-arrow-halo" />}
              <path d={geometry.path} className="diagram-arrow-line" strokeWidth={arrow.style === 'double' ? 4.5 : 1.5}
                strokeDasharray={arrow.style === 'dashed' ? '7 5' : arrow.style === 'dotted' ? '1 5' : undefined} />
              {arrow.style === 'double' && <path d={geometry.path} className="diagram-arrow-inner" />}
              <ArrowTip head={arrow.start} point={geometry.start} rotation={geometry.startAngle} double={arrow.style === 'double'} />
              <ArrowTip head={arrow.end} point={geometry.end} rotation={geometry.endAngle} double={arrow.style === 'double'} />
              {arrow.label && <foreignObject x={geometry.label.x - label.width / 2} y={geometry.label.y - label.height / 2}
                width={Math.max(label.width, 1)} height={Math.max(label.height, 1)} className="diagram-arrow-label">
                <DiagramMath label={arrow.label} onSize={(w, h) => measure(arrow.id, w, h)} />
              </foreignObject>}
            </g>
          );
        })}
        {sourceNode && cursor && <path d={`M ${nodePoint(sourceNode).x},${nodePoint(sourceNode).y} L ${cursor.x},${cursor.y}`} className="diagram-connection-preview" />}
        {diagram.nodes.map((node) => {
          const p = nodePoint(node), dimensions = nodeSize(node.id);
          const selected = selectedIds.includes(node.id);
          return (
            <g key={node.id} data-node-id={node.id} className={`diagram-node ${selected ? 'is-selected' : ''} ${source === node.id ? 'is-source' : ''}`}
              role="button" tabIndex={0} aria-label={`Object ${node.name}: ${node.label}`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (tool === 'connect') onNodeClick(node.id); else onSelect({ kind: 'nodes', ids: [node.id] });
                }
              }}
              onPointerDown={(event) => onNodeDown(event, node)}
              onDoubleClick={(event) => { event.stopPropagation(); onSelect({ kind: 'nodes', ids: [node.id] }); onEditNode(); }}>
              <title>{node.label}</title>
              <rect x={p.x - dimensions.width / 2 - 7} y={p.y - dimensions.height / 2 - 5}
                width={dimensions.width + 14} height={dimensions.height + 10} rx="5" className="diagram-node-box" />
              <foreignObject x={p.x - dimensions.width / 2} y={p.y - dimensions.height / 2}
                width={Math.max(dimensions.width, 1)} height={Math.max(dimensions.height, 1)} className="diagram-node-label">
                <DiagramMath label={node.label} onSize={(w, h) => measure(node.id, w, h)} />
              </foreignObject>
            </g>
          );
        })}
      </svg>
      {!diagram.nodes.length && <div className="diagram-empty-canvas">
        <span className="diagram-empty-symbol">A → B</span><h3>Start with an object</h3>
        <p>Double-click the canvas, or choose a preset.</p>
      </div>}
      <div className="diagram-zoom" aria-label="Canvas zoom">
        <button onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out">−</button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button onClick={() => zoomAt(1.2)} aria-label="Zoom in">+</button>
        <button onClick={fit} title="Fit diagram to canvas">Fit</button>
      </div>
    </div>
  );
}

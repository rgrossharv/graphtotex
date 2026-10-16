import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type PointerEvent } from 'react';
import katex from 'katex';
import TikzModal from './TikzModal';
import {
  ARROW_STYLES, BOARD_PADDING, CELL_HEIGHT, CELL_WIDTH, DIAGRAM_STORAGE_KEY,
  arrowGeometry, createDiagramArrow, diagramTemplate, isDiagram, nodePoint,
  type Diagram, type DiagramArrow, type DiagramNode, type DiagramTemplate, type DiagramNodeSizes
} from '../lib/diagram';
import { generateDiagramTikz } from '../lib/tikzDiagram';
import { generateDiagramTikzCd } from '../lib/tikzCdExport';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Selection = { kind: 'node' | 'arrow'; id: string } | null;
type Tool = 'select' | 'object' | 'arrow';
interface History { past: Diagram[]; present: Diagram; future: Diagram[] }
type Action = { type: 'commit'; diagram: Diagram } | { type: 'undo' | 'redo' };

function historyReducer(state: History, action: Action): History {
  if (action.type === 'commit') {
    if (JSON.stringify(state.present) === JSON.stringify(action.diagram)) return state;
    return { past: [...state.past.slice(-79), state.present], present: action.diagram, future: [] };
  }
  if (action.type === 'undo' && state.past.length) {
    return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
  }
  if (action.type === 'redo' && state.future.length) {
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  return state;
}

function loadDiagram(): History {
  let present = diagramTemplate('square');
  if (typeof window === 'undefined') return { past: [], present, future: [] };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DIAGRAM_STORAGE_KEY) || 'null');
    if (isDiagram(saved)) present = saved;
  } catch { /* Start with a square if storage is unavailable or invalid. */ }
  return { past: [], present, future: [] };
}

function mathPreview(label: string): { html: string; error: string | null } {
  try {
    return { html: katex.renderToString(label, { throwOnError: true, strict: 'ignore', trust: false }), error: null };
  } catch (error) {
    return { html: '', error: error instanceof Error ? error.message.replace(/^KaTeX parse error: /, '') : 'Invalid LaTeX label.' };
  }
}

function MathLabel({ label, onMeasure }: { label: string; onMeasure?: (width: number, height: number) => void }) {
  const preview = useMemo(() => mathPreview(label), [label]);
  const ref = useRef<HTMLSpanElement>(null);
  const measureRef = useRef(onMeasure);
  measureRef.current = onMeasure;
  const shouldMeasure = !!onMeasure;
  useBrowserLayoutEffect(() => {
    if (!ref.current || !shouldMeasure) return;
    const measure = () => { if (ref.current) measureRef.current?.(ref.current.offsetWidth, ref.current.offsetHeight); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [label, shouldMeasure]);
  return <span ref={ref} className="diagram-math-content">{preview.error
    ? <span className="diagram-math-error" title={preview.error}>{label || '?'}</span>
    : <span dangerouslySetInnerHTML={{ __html: preview.html }} />}</span>;
}

function Icon({ name }: { name: 'select' | 'object' | 'arrow' | 'undo' | 'redo' | 'export' | 'trash' }) {
  const paths = {
    select: 'M5 3l13 9-7 1-3 7z', object: 'M12 5v14M5 12h14', arrow: 'M4 18L20 4M10 4h10v10',
    undo: 'M9 5L4 10l5 5M4 10h10a6 6 0 0 1 0 12', redo: 'M15 5l5 5-5 5M20 10H10a6 6 0 0 0 0 12',
    export: 'M12 15V3M7 8l5-5 5 5M5 14v6h14v-6', trash: 'M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6'
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function DiagramEditor() {
  const [history, dispatch] = useReducer(historyReducer, undefined, loadDiagram);
  const diagram = history.present;
  const [selection, setSelection] = useState<Selection>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [message, setMessage] = useState('Select an object or arrow to edit its properties.');
  const [saveStatus, setSaveStatus] = useState('Saved on this device');
  const [drag, setDrag] = useState<{ id: string; column: number; row: number } | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; offsetX: number; offsetY: number; column: number; row: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<'tikz' | 'tikzcd'>('tikz');
  const [scale, setScale] = useState(1.2);
  const [showGrid, setShowGrid] = useState(true);
  const [nodeSizes, setNodeSizes] = useState<DiagramNodeSizes>({});

  const commit = (next: Diagram) => dispatch({ type: 'commit', diagram: next });
  const selectedNode = selection?.kind === 'node' ? diagram.nodes.find((n) => n.id === selection.id) : undefined;
  const selectedArrow = selection?.kind === 'arrow' ? diagram.arrows.find((a) => a.id === selection.id) : undefined;
  const source = diagram.nodes.find((n) => n.id === sourceId);
  const code = useMemo(() => exportKind === 'tikzcd' ? generateDiagramTikzCd(diagram, scale) : generateDiagramTikz(diagram, scale, nodeSizes), [diagram, scale, nodeSizes, exportKind]);
  const labelErrors = useMemo(() => [...diagram.nodes, ...diagram.arrows].filter((item) => mathPreview(item.label).error), [diagram]);

  useEffect(() => {
    try {
      localStorage.setItem(DIAGRAM_STORAGE_KEY, JSON.stringify(diagram));
      setSaveStatus('Saved on this device');
    } catch { setSaveStatus('Draft is available in this session'); }
  }, [diagram]);

  const changeTool = (next: Tool) => {
    setTool(next); setSourceId(null);
    setMessage(next === 'object' ? 'Click an empty grid position to add an object.' : next === 'arrow' ? 'Choose the source object, then the destination.' : 'Drag objects to move them. Select an arrow to edit it.');
  };

  const removeSelected = () => {
    if (!selection) return;
    if (selection.kind === 'node') {
      commit({ ...diagram, nodes: diagram.nodes.filter((n) => n.id !== selection.id), arrows: diagram.arrows.filter((a) => a.from !== selection.id && a.to !== selection.id) });
    } else commit({ ...diagram, arrows: diagram.arrows.filter((a) => a.id !== selection.id) });
    setSelection(null); setSourceId(null);
    setMessage(selection.kind === 'node' ? 'Object and its connected arrows removed. Undo to restore them.' : 'Arrow removed. Undo to restore it.');
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isExportOpen) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); setSourceId(null);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); dispatch({ type: 'redo' }); setSourceId(null);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); removeSelected();
      } else if (event.key === 'Escape') {
        changeTool('select'); setSelection(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const patchNode = (patch: Partial<DiagramNode>) => {
    if (!selectedNode) return;
    const next = { ...selectedNode, ...patch };
    if (diagram.nodes.some((n) => n.id !== next.id && n.column === next.column && n.row === next.row)) {
      setMessage('That position already has an object. Choose an empty position.'); return;
    }
    commit({ ...diagram, nodes: diagram.nodes.map((n) => n.id === next.id ? next : n) });
  };
  const patchArrow = (patch: Partial<DiagramArrow>) => {
    if (!selectedArrow) return;
    const next = { ...selectedArrow, ...patch };
    if (next.from === next.to) { setMessage('Choose two different objects for an arrow.'); return; }
    commit({ ...diagram, arrows: diagram.arrows.map((a) => a.id === next.id ? next : a) });
  };

  const addObject = (column: number, row: number) => {
    const labels = new Set(diagram.nodes.map((n) => n.label));
    const label = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').find((letter) => !labels.has(letter)) || `X_{${diagram.nodes.length + 1}}`;
    const node: DiagramNode = { id: crypto.randomUUID(), label, column, row };
    commit({ ...diagram, nodes: [...diagram.nodes, node] });
    setSelection({ kind: 'node', id: node.id });
    setMessage('Object added. Enter a LaTeX label in the properties panel.');
    requestAnimationFrame(() => { labelInputRef.current?.focus(); labelInputRef.current?.select(); });
  };

  const selectNode = (node: DiagramNode) => {
    setSelection({ kind: 'node', id: node.id });
    if (tool !== 'arrow') return;
    if (!source) {
      setSourceId(node.id); setMessage(`Source selected. Choose the destination for ${node.label}.`);
    } else if (source.id === node.id) {
      setMessage('Choose a different object as the destination.');
    } else {
      const arrow = createDiagramArrow(source.id, node.id);
      const parallel = diagram.arrows.filter((a) => (a.from === source.id && a.to === node.id) || (a.to === source.id && a.from === node.id));
      if (parallel.length) arrow.bend = 25;
      commit({ ...diagram, arrows: [...diagram.arrows, arrow] });
      setSelection({ kind: 'arrow', id: arrow.id }); setSourceId(null); setTool('select');
      setMessage('Arrow connected. Add a label or adjust its style.');
      requestAnimationFrame(() => labelInputRef.current?.focus());
    }
  };

  const svgPoint = (event: PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  };
  const startDrag = (event: PointerEvent<SVGGElement>, node: DiagramNode) => {
    if (event.button !== 0) return;
    event.stopPropagation(); selectNode(node);
    if (tool !== 'select') return;
    const point = svgPoint(event), center = nodePoint(node);
    if (!point) return;
    dragRef.current = { id: node.id, pointerId: event.pointerId, offsetX: point.x - center.x, offsetY: point.y - center.y, column: node.column, row: node.row };
    svgRef.current?.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const active = dragRef.current, point = svgPoint(event);
    if (!active || !point || active.pointerId !== event.pointerId) return;
    active.column = Math.max(0, Math.min(diagram.columns - 1, (point.x - active.offsetX - BOARD_PADDING) / CELL_WIDTH));
    active.row = Math.max(0, Math.min(diagram.rows - 1, (point.y - active.offsetY - BOARD_PADDING) / CELL_HEIGHT));
    setDrag({ id: active.id, column: active.column, row: active.row });
  };
  const finishDrag = (event: PointerEvent<SVGSVGElement>, cancelled = false) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!cancelled) {
      const column = Math.round(active.column), row = Math.round(active.row);
      if (diagram.nodes.some((n) => n.id !== active.id && n.column === column && n.row === row)) {
        setMessage('That position is occupied. The object was returned to its original position.');
      } else commit({ ...diagram, nodes: diagram.nodes.map((n) => n.id === active.id ? { ...n, column, row } : n) });
    }
    dragRef.current = null; setDrag(null);
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  };

  const loadTemplate = (template: DiagramTemplate) => {
    commit(diagramTemplate(template)); setSelection(null); setSourceId(null); setTool('select');
    setMessage('Template loaded. You can undo to return to your previous diagram.');
  };
  const resizeGrid = (axis: 'rows' | 'columns', value: number) => {
    const used = Math.max(1, ...diagram.nodes.map((n) => axis === 'rows' ? n.row : n.column)) + 1;
    if (value < used) { setMessage('Move or remove objects near the edge before shrinking the grid.'); return; }
    commit({ ...diagram, [axis]: value });
  };
  const displayNodes = diagram.nodes.map((n) => drag?.id === n.id ? { ...n, column: drag.column, row: drag.row } : n);
  const boardWidth = BOARD_PADDING * 2 + (diagram.columns - 1) * CELL_WIDTH;
  const boardHeight = BOARD_PADDING * 2 + (diagram.rows - 1) * CELL_HEIGHT;
  const extents = displayNodes.map((node) => ({ point: nodePoint(node), size: nodeSizes[node.id] ?? { width: 120, height: 68 } }));
  const left = Math.min(0, ...extents.map(({ point, size }) => point.x - size.width / 2 - 24));
  const top = Math.min(0, ...extents.map(({ point, size }) => point.y - size.height / 2 - 24));
  const width = Math.max(boardWidth, ...extents.map(({ point, size }) => point.x + size.width / 2 + 24)) - left;
  const height = Math.max(boardHeight, ...extents.map(({ point, size }) => point.y + size.height / 2 + 24)) - top;

  return (
    <main className="diagram-workspace">
      <div className="diagram-toolbar">
        <div className="diagram-tools" role="group" aria-label="Diagram tools">
          {([{ value: 'select', name: 'Select' }, { value: 'object', name: 'Add object' }, { value: 'arrow', name: 'Connect' }] as const).map((item) => (
            <button key={item.value} className={tool === item.value ? 'is-active' : ''} aria-pressed={tool === item.value} onClick={() => changeTool(item.value)}><Icon name={item.value} />{item.name}</button>
          ))}
        </div>
        <div className="diagram-history" role="group" aria-label="Edit history">
          <button disabled={!history.past.length} onClick={() => { dispatch({ type: 'undo' }); setSourceId(null); }} title="Undo (⌘/Ctrl Z)" aria-label="Undo"><Icon name="undo" /></button>
          <button disabled={!history.future.length} onClick={() => { dispatch({ type: 'redo' }); setSourceId(null); }} title="Redo (⌘/Ctrl Shift Z)" aria-label="Redo"><Icon name="redo" /></button>
        </div>
        <label className="diagram-template-select"><span>Start from</span>
          <select aria-label="Diagram template" value="" onChange={(event) => loadTemplate(event.target.value as DiagramTemplate)}>
            <option value="" disabled>Choose a template</option><option value="square">Commutative square</option><option value="triangle">Commutative triangle</option><option value="sequence">Exact sequence</option><option value="blank">Empty diagram</option>
          </select>
        </label>
        <div className="diagram-export-actions">
          <button className="diagram-export-button" disabled={!diagram.nodes.length || !!labelErrors.length} onClick={() => { setExportKind('tikz'); setIsExportOpen(true); }}><Icon name="export" />Export TikZ</button>
          <button className="diagram-export-button" disabled={!diagram.nodes.length || !!labelErrors.length} onClick={() => { setExportKind('tikzcd'); setIsExportOpen(true); }}><Icon name="export" />Export TikZ-CD</button>
        </div>
      </div>

      <section className="diagram-canvas-panel" aria-label="Diagram canvas">
        <div className="diagram-canvas-header">
          <div><h2>Commutative diagram</h2><p>{diagram.nodes.length} objects <span aria-hidden="true">·</span> {diagram.arrows.length} arrows</p></div>
          <span className="diagram-save-status"><span aria-hidden="true">●</span> {saveStatus}</span>
        </div>
        <div className={`diagram-board-scroll tool-${tool}`}>
          <svg ref={svgRef} className="diagram-board" viewBox={`${left} ${top} ${width} ${height}`} style={{ aspectRatio: `${width} / ${height}` }} aria-label="Editable commutative diagram"
            aria-describedby="diagram-description"
            onPointerMove={moveDrag} onPointerUp={(event) => finishDrag(event)} onPointerCancel={(event) => finishDrag(event, true)}>
            <desc id="diagram-description">Commutative diagram with {diagram.nodes.length} objects and {diagram.arrows.length} arrows.
              {' '}Create objects with LaTeX labels, connect them with labeled arrows, and export TikZ or TikZ-CD code.
              {' '}Objects: {diagram.nodes.map((node) => node.label).join(', ') || 'none'}.</desc>
            <defs>
              <pattern id="diagram-dot-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--border)" /></pattern>
              {diagram.arrows.map((arrow) => <g key={arrow.id}>
                <marker id={`tip-${arrow.id}`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L10 6L1 11" fill="none" stroke={arrow.color === '#334155' ? 'var(--diagram-arrow)' : arrow.color} strokeWidth="1.5" /></marker>
                <marker id={`twohead-${arrow.id}`} viewBox="0 0 16 12" refX="14" refY="6" markerWidth="11" markerHeight="8" orient="auto"><path d="M1 1L8 6L1 11M7 1L14 6L7 11" fill="none" stroke={arrow.color === '#334155' ? 'var(--diagram-arrow)' : arrow.color} strokeWidth="1.5" /></marker>
                <marker id={`hook-${arrow.id}`} viewBox="0 0 12 12" refX="2" refY="6" markerWidth="8" markerHeight="8" orient="auto"><path d="M10 6H5C0 6 0 0 5 0" fill="none" stroke={arrow.color === '#334155' ? 'var(--diagram-arrow)' : arrow.color} strokeWidth="1.5" /></marker>
              </g>)}
            </defs>
            <rect x={left} y={top} width={width} height={height} fill={showGrid ? 'url(#diagram-dot-grid)' : 'transparent'} onPointerDown={() => { setSelection(null); if (sourceId) { setSourceId(null); setMessage('Connection cancelled. Choose a source object.'); } }} />
            {Array.from({ length: diagram.rows }, (_, row) => Array.from({ length: diagram.columns }, (_, column) => {
              if (diagram.nodes.some((n) => n.column === column && n.row === row)) return null;
              const x = BOARD_PADDING + column * CELL_WIDTH, y = BOARD_PADDING + row * CELL_HEIGHT;
              return <g key={`${column}-${row}`} className="diagram-empty-cell" role={tool === 'object' ? 'button' : undefined} tabIndex={tool === 'object' ? 0 : undefined} aria-label={`Add object at row ${row + 1}, column ${column + 1}`}
                onClick={() => tool === 'object' ? addObject(column, row) : setSelection(null)} onKeyDown={(event) => { if (tool === 'object' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); addObject(column, row); } }}>
                <rect x={x - 59} y={y - 33} width="118" height="66" rx="12" />
                <path d={`M ${x - 7} ${y} h14 M ${x} ${y - 7} v14`} />
              </g>;
            }))}
            {diagram.arrows.map((arrow) => {
              const from = displayNodes.find((n) => n.id === arrow.from), to = displayNodes.find((n) => n.id === arrow.to);
              if (!from || !to) return null;
              const geometry = arrowGeometry(from, to, arrow, nodeSizes);
              const selected = selectedArrow?.id === arrow.id;
              return <g key={arrow.id} className={`diagram-arrow ${selected ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-label={`Edit arrow ${from.label} to ${to.label}${arrow.label ? `, label ${arrow.label}` : ''}`}
                onPointerDown={(event) => { event.stopPropagation(); setSelection({ kind: 'arrow', id: arrow.id }); setSourceId(null); }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelection({ kind: 'arrow', id: arrow.id }); } }}>
                {selected && <path d={geometry.path} className="diagram-arrow-highlight" />}
                <path d={geometry.path} stroke={arrow.color === '#334155' ? 'var(--diagram-arrow)' : arrow.color} strokeWidth="1.8" strokeDasharray={arrow.dashed ? '7 5' : undefined} fill="none"
                  markerEnd={arrow.style === 'none' ? undefined : `url(#${arrow.style === 'twohead' ? 'twohead' : 'tip'}-${arrow.id})`}
                  markerStart={arrow.style === 'both' ? `url(#tip-${arrow.id})` : arrow.style === 'inclusion' ? `url(#hook-${arrow.id})` : undefined} />
                <path d={geometry.path} className="diagram-arrow-hit" />
                {arrow.label && <foreignObject x={geometry.label.x - 85} y={geometry.label.y - 30} width="170" height="60" className="diagram-arrow-label">
                  <div className="diagram-label" style={{ color: arrow.color === '#334155' ? 'var(--diagram-arrow)' : arrow.color }}><span className="diagram-label-plate"><MathLabel label={arrow.label} /></span></div>
                </foreignObject>}
              </g>;
            })}
            {displayNodes.map((node) => {
              const point = nodePoint(node), selected = selectedNode?.id === node.id;
              const size = nodeSizes[node.id] ?? { width: 120, height: 68 };
              return <g key={node.id} className={`diagram-object ${selected ? 'is-selected' : ''} ${sourceId === node.id ? 'is-source' : ''}`} role="button" tabIndex={0} aria-label={`Object ${node.label}, row ${Math.round(node.row) + 1}, column ${Math.round(node.column) + 1}`}
                onPointerDown={(event) => startDrag(event, node)} onDoubleClick={() => { labelInputRef.current?.focus(); labelInputRef.current?.select(); }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node); } }}>
                <rect x={point.x - size.width / 2} y={point.y - size.height / 2} width={size.width} height={size.height} rx="12" />
                <foreignObject x={point.x - size.width / 2 + 2} y={point.y - size.height / 2 + 2} width={size.width - 4} height={size.height - 4}>
                  <div className="diagram-label diagram-object-label"><MathLabel label={node.label || '?'} onMeasure={(width, height) => {
                    const next = { width: Math.max(120, width + 24), height: Math.max(68, height + 20) };
                    setNodeSizes((prev) => prev[node.id]?.width === next.width && prev[node.id]?.height === next.height ? prev : { ...prev, [node.id]: next });
                  }} /></div>
                </foreignObject>
              </g>;
            })}
          </svg>
        </div>
        <div className="diagram-status-bar"><span role="status">{message}</span><label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />Show grid</label></div>
      </section>

      <aside className="diagram-inspector" aria-label="Diagram properties">
        <div className="diagram-inspector-heading"><span className="diagram-eyebrow">Properties</span><h2>{selectedNode ? 'Object' : selectedArrow ? 'Arrow' : 'Your workspace'}</h2></div>
        <div className="diagram-inspector-content">
          {selectedNode || selectedArrow ? <>
            <label className="diagram-field">{selectedNode ? 'Object label' : 'Arrow label'}<input ref={labelInputRef} aria-label={selectedNode ? 'Object label' : 'Arrow label'} className="diagram-latex-input" value={selectedNode?.label ?? selectedArrow?.label ?? ''} placeholder={selectedNode ? 'e.g. \\mathbb{Z}' : 'e.g. f or \\varphi'} onChange={(event) => selectedNode ? patchNode({ label: event.target.value }) : patchArrow({ label: event.target.value })} /></label>
            <div className="diagram-label-preview"><MathLabel label={selectedNode?.label ?? selectedArrow?.label ?? ''} /></div>
            {mathPreview(selectedNode?.label ?? selectedArrow?.label ?? '').error && <p className="diagram-field-error" role="alert">{mathPreview(selectedNode?.label ?? selectedArrow?.label ?? '').error}</p>}
            <p className="diagram-help">LaTeX math, without <code>$</code> delimiters.</p>
            {selectedNode && <div className="diagram-field-pair">
              <label className="diagram-field">Column<select aria-label="Object column" value={selectedNode.column} onChange={(event) => patchNode({ column: Number(event.target.value) })}>{Array.from({ length: diagram.columns }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
              <label className="diagram-field">Row<select aria-label="Object row" value={selectedNode.row} onChange={(event) => patchNode({ row: Number(event.target.value) })}>{Array.from({ length: diagram.rows }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
            </div>}
            {selectedArrow && <>
              <div className="diagram-field-pair">{(['from', 'to'] as const).map((key) => <label className="diagram-field" key={key}>{key === 'from' ? 'Source' : 'Destination'}<select aria-label={`Arrow ${key === 'from' ? 'source' : 'destination'}`} value={selectedArrow[key]} onChange={(event) => patchArrow({ [key]: event.target.value })}>{diagram.nodes.map((n) => <option key={n.id} value={n.id} disabled={n.id === selectedArrow[key === 'from' ? 'to' : 'from']}>{n.label || '(empty)'}</option>)}</select></label>)}</div>
              <label className="diagram-field">Arrow style<select aria-label="Arrow style" value={selectedArrow.style} onChange={(event) => patchArrow({ style: event.target.value as DiagramArrow['style'] })}>{ARROW_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
              <label className="diagram-field">Label side<select aria-label="Arrow label side" value={selectedArrow.labelSide} onChange={(event) => patchArrow({ labelSide: event.target.value as 'left' | 'right' })}><option value="left">Left of the arrow</option><option value="right">Right of the arrow</option></select></label>
              <label className="diagram-field">Curve <span className="diagram-range-value">{selectedArrow.bend === 0 ? 'Straight' : `${selectedArrow.bend}°`}</span><input aria-label="Arrow curve" type="range" min="-50" max="50" step="5" value={selectedArrow.bend} onChange={(event) => patchArrow({ bend: Number(event.target.value) })} /></label>
              <div className="diagram-field-pair"><label className="diagram-field">Color<input aria-label="Arrow color" type="color" value={selectedArrow.color} onChange={(event) => patchArrow({ color: event.target.value })} /></label><label className="diagram-checkbox"><input type="checkbox" checked={selectedArrow.dashed} onChange={(event) => patchArrow({ dashed: event.target.checked })} />Dashed</label></div>
              <button className="diagram-secondary-button" onClick={() => patchArrow({ from: selectedArrow.to, to: selectedArrow.from, bend: -selectedArrow.bend, labelSide: selectedArrow.labelSide === 'left' ? 'right' : 'left' })}>⇄ Reverse direction</button>
            </>}
            <button className="diagram-delete-button" onClick={removeSelected}><Icon name="trash" />Delete {selectedNode ? 'object' : 'arrow'}</button>
          </> : <div className="diagram-onboarding"><div className="diagram-onboarding-symbol" aria-hidden="true">A <span>→</span> B</div><h3>From objects to arrows.</h3><p>Select anything in the diagram to edit it. Drag objects to arrange them on the grid.</p><ol><li><strong>Add object</strong> places a new object in an empty cell.</li><li><strong>Connect</strong> links a source to a destination.</li><li><strong>Export TikZ</strong> gives you LaTeX code to copy or download.</li></ol><p className="diagram-help">Double-click an object to edit its label. Delete removes a selection; ⌘/Ctrl Z undoes an edit.</p></div>}

          <section className="diagram-grid-settings"><h3>Canvas layout</h3><div className="diagram-field-pair">
            {(['columns', 'rows'] as const).map((axis) => <label className="diagram-field" key={axis}>{axis === 'columns' ? 'Columns' : 'Rows'}<select aria-label={`Grid ${axis}`} value={diagram[axis]} onChange={(event) => resizeGrid(axis, Number(event.target.value))}>{Array.from({ length: 7 }, (_, i) => <option key={i} value={i + 2}>{i + 2}</option>)}</select></label>)}
          </div></section>
          <section className="diagram-outline"><h3>Objects <span>{diagram.nodes.length}</span></h3>{diagram.nodes.length ? diagram.nodes.map((node) => <button key={node.id} className={selectedNode?.id === node.id ? 'is-active' : ''} onClick={() => { changeTool('select'); setSelection({ kind: 'node', id: node.id }); }}><MathLabel label={node.label || '?'} /><span>{node.row + 1}, {node.column + 1}</span></button>) : <p className="diagram-help">Start with Add object or choose a template.</p>}</section>
          {!!labelErrors.length && <p className="diagram-field-error">Fix {labelErrors.length} invalid LaTeX {labelErrors.length === 1 ? 'label' : 'labels'} before exporting.</p>}
        </div>
      </aside>
      <TikzModal isOpen={isExportOpen} variant={exportKind === 'tikzcd' ? 'diagram-cd' : 'diagram'} tikzCode={code} scale={scale} onScaleChange={setScale} onClose={() => setIsExportOpen(false)} />
    </main>
  );
}

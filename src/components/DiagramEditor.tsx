import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createArrow, createNode, diagramId, diagramPreset, DIAGRAM_STORAGE_KEY, GRID_STEP,
  parseDiagramFile, PRESETS, serializeDiagram, type ArrowHead,
  type DiagramArrow, type DiagramNode, type LabelSide, type LineStyle, type LoopSide
} from '../lib/diagram';
import { downloadText } from '../lib/diagramExport';
import useDiagramHistory from '../lib/useDiagramHistory';
import DiagramCanvas, { type DiagramSelection, type DiagramTool } from './DiagramCanvas';
import DiagramMath, { previewMath } from './DiagramMath';
import DiagramExportModal from './DiagramExportModal';
import '../diagram.css';

function ToolIcon({ type }: { type: DiagramTool }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    {type === 'select' && <path d="M5 3v16l4-4 4 7 3-2-4-7h7L5 3Z" />}
    {type === 'connect' && <><circle cx="4" cy="19" r="2" /><circle cx="20" cy="5" r="2" /><path d="m6 17 10-9M10 8h6v6" /></>}
    {type === 'object' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 7v10M7 12h10" /></>}
    {type === 'pan' && <><path d="M12 2v20M2 12h20m-13-7 3-3 3 3m-6 14 3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3" /></>}
  </svg>;
}

function PresetIcon({ type }: { type: string }) {
  return <svg viewBox="0 0 90 52" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    {['square', 'pullback'].includes(type) && <><path d="M26 13h36m-4-3 4 3-4 3M22 17v23m-3-4 3 4 3-4M68 17v23m-3-4 3 4 3-4M26 44h36m-4-3 4 3-4 3" /><circle cx="22" cy="13" r="2" /><circle cx="68" cy="13" r="2" /><circle cx="22" cy="44" r="2" /><circle cx="68" cy="44" r="2" />{type === 'pullback' && <path strokeDasharray="3 2" d="M6 2 19 10M6 2h56M6 2v37" />}</>}
    {type === 'triangle' && <><path d="M19 9h52M19 9l26 35L71 9m-4 0 4 0-2 4m-25 27 1 4 4-2" /><circle cx="19" cy="9" r="2" /><circle cx="71" cy="9" r="2" /><circle cx="45" cy="44" r="2" /></>}
    {type === 'exact' && <><path d="M10 26h12m-4-3 4 3-4 3m12-3h14m-4-3 4 3-4 3m12-3h14m-4-3 4 3-4 3m12-3h10m-4-3 4 3-4 3" /><circle cx="6" cy="26" r="2" /><circle cx="26" cy="26" r="2" /><circle cx="48" cy="26" r="2" /><circle cx="70" cy="26" r="2" /><circle cx="86" cy="26" r="2" /></>}
    {type === 'parallel' && <><path d="M17 25Q45-8 73 25m-6-7 6 7-8-1M17 27Q45 60 73 27m-8 1 8-1-6 7" /><circle cx="14" cy="26" r="2" /><circle cx="76" cy="26" r="2" /></>}
    {type === 'cube' && <><path d="M16 20h40v27H16ZM34 5h40v27H34ZM16 20 34 5m22 15L74 5M56 47l18-15M16 47l18-15" /><path strokeDasharray="3 2" d="M34 5v27h40M16 47l18-15" /></>}
  </svg>;
}

const HEAD_OPTIONS: { value: ArrowHead; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'arrow', label: 'Arrowhead' },
  { value: 'hook', label: 'Hook / inclusion' }, { value: 'tail', label: 'Bar / maps to' },
  { value: 'twoheads', label: 'Double head / surjection' }
];

function MathInput({ label, value, onChange, inputRef }: {
  label: string; value: string; onChange: (value: string) => void; inputRef?: React.RefObject<HTMLInputElement>
}) {
  const preview = previewMath(value);
  return <div className="diagram-label-field">
    <label>{label}<input ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)}
      spellCheck={false} autoComplete="off" placeholder="TeX, e.g. \mathcal{C}" /></label>
    <div className="diagram-label-preview"><DiagramMath label={value || '\\phantom{A}'} /></div>
    {preview.error && <p className="diagram-input-error">Preview unavailable. Your TeX is preserved for export. Check braces or define custom commands in your document.</p>}
  </div>;
}

export default function DiagramEditor() {
  const { diagram, update, preview, commitGesture, undo, redo, canUndo, canRedo } = useDiagramHistory();
  const [selection, setSelection] = useState<DiagramSelection>(null);
  const [tool, setTool] = useState<DiagramTool>('select');
  const [source, setSource] = useState<string | null>(null);
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [fitVersion, setFitVersion] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saved on this device');
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const nodeLabelInput = useRef<HTMLInputElement>(null);
  const arrowLabelInput = useRef<HTMLInputElement>(null);
  const newLabelInput = useRef<HTMLInputElement>(null);
  const latestDiagram = useRef(diagram);
  latestDiagram.current = diagram;
  const selectedIds = selection?.kind === 'nodes' ? selection.ids.filter((id) => diagram.nodes.some((node) => node.id === id)) : [];
  const selectedNodes = diagram.nodes.filter((node) => selectedIds.includes(node.id));
  const node = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const arrow = selection?.kind === 'arrow' ? diagram.arrows.find((item) => item.id === selection.id) : null;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try { localStorage.setItem(DIAGRAM_STORAGE_KEY, serializeDiagram(diagram)); setSaveStatus('Saved on this device'); }
      catch { setSaveStatus('Use Save to keep this diagram'); }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [diagram]);

  // Flush on navigation too, so switching pages cannot discard a recent edit.
  useEffect(() => () => {
    try { localStorage.setItem(DIAGRAM_STORAGE_KEY, serializeDiagram(latestDiagram.current)); }
    catch { /* Save is still available when browser storage is disabled. */ }
  }, []);

  useEffect(() => {
    if (source && !diagram.nodes.some((item) => item.id === source)) setSource(null);
  }, [diagram.nodes, source]);

  const chooseTool = (next: DiagramTool) => { setTool(next); setSource(null); };
  const select = (next: DiagramSelection) => { setSelection(next); if (!next) setSource(null); };
  const updateNode = (id: string, patch: Partial<DiagramNode>, field: string) => {
    update((prev) => ({ ...prev, nodes: prev.nodes.map((item) => item.id === id ? { ...item, ...patch } : item) }), `${id}:${field}`);
  };
  const updateArrow = (id: string, patch: Partial<DiagramArrow>, field = '') => {
    update((prev) => ({ ...prev, arrows: prev.arrows.map((item) => item.id === id ? { ...item, ...patch } : item) }), field ? `${id}:${field}` : '');
  };

  const addNode = (x: number, y: number) => {
    const adjust = (value: number) => Math.max(-1000, Math.min(1000, snap ? Math.round(value / GRID_STEP) * GRID_STEP : value));
    const next = createNode(diagram.nodes, adjust(x), adjust(y), newLabel.trim() || undefined);
    update((prev) => ({ ...prev, nodes: [...prev.nodes, next] }));
    setSelection({ kind: 'nodes', ids: [next.id] }); setNewLabel('');
    if (tool !== 'object') window.setTimeout(() => { nodeLabelInput.current?.focus(); nodeLabelInput.current?.select(); }, 0);
  };

  const addFromForm = () => {
    let x = 0, y = 0, attempt = 0;
    while (diagram.nodes.some((item) => Math.hypot(item.x - x, item.y - y) < 1)) {
      attempt += 1; x = (attempt % 5 - 2) * 2; y = -Math.floor(attempt / 5) * 1.5;
    }
    addNode(x, y); setFitVersion((prev) => prev + 1);
  };

  const connect = (id: string) => {
    if (!source) { setSource(id); setSelection({ kind: 'nodes', ids: [id] }); return; }
    const related = diagram.arrows.filter((item) => item.from === source && item.to === id);
    const next = createArrow(source, id, { bend: related.length ? (related.length % 2 ? -1 : 1) * Math.min(75, 24 + Math.floor(related.length / 2) * 18) : 0 });
    update((prev) => ({ ...prev, arrows: [...prev.arrows.map((item) =>
      related.length === 1 && item.id === related[0].id && item.bend === 0 && source !== id ? { ...item, bend: 24 } : item), next] }));
    setSelection({ kind: 'arrow', id: next.id }); setSource(null);
  };

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    update((prev) => selection.kind === 'nodes' ? {
      nodes: prev.nodes.filter((item) => !selection.ids.includes(item.id)),
      arrows: prev.arrows.filter((item) => !selection.ids.includes(item.from) && !selection.ids.includes(item.to))
    } : { ...prev, arrows: prev.arrows.filter((item) => item.id !== selection.id) });
    setSelection(null); setSource(null);
  }, [selection, update]);

  const duplicate = useCallback(() => {
    if (!selection) return;
    if (selection.kind === 'arrow') {
      const original = diagram.arrows.find((item) => item.id === selection.id);
      if (!original) return;
      const next = { ...original, id: diagramId(), bend: original.bend === 0 ? -24 : -original.bend };
      update((prev) => ({ ...prev, arrows: [...prev.arrows.map((item) => item.id === original.id && original.bend === 0 ? { ...item, bend: 24 } : item), next] }));
      setSelection({ kind: 'arrow', id: next.id });
      return;
    }
    const nodes = [...diagram.nodes];
    const idMap = new Map<string, string>();
    for (const item of diagram.nodes.filter((entry) => selection.ids.includes(entry.id))) {
      const next = createNode(nodes, Math.min(1000, item.x + 0.5), Math.max(-1000, item.y - 0.5), item.label);
      nodes.push(next); idMap.set(item.id, next.id);
    }
    const arrows = diagram.arrows.filter((item) => idMap.has(item.from) && idMap.has(item.to))
      .map((item) => ({ ...item, id: diagramId(), from: idMap.get(item.from)!, to: idMap.get(item.to)! }));
    update({ nodes, arrows: [...diagram.arrows, ...arrows] });
    setSelection({ kind: 'nodes', ids: [...idMap.values()] });
  }, [diagram, selection, update]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exportOpen || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); setSource(null); return; }
      if (modifier && key === 'y') { event.preventDefault(); redo(); setSource(null); return; }
      if (modifier && key === 'd') { event.preventDefault(); duplicate(); return; }
      if (modifier && key === 'a') { event.preventDefault(); setSelection({ kind: 'nodes', ids: diagram.nodes.map((item) => item.id) }); return; }
      if (modifier) return;
      if (event.key === 'Escape') { setSource(null); setTool('select'); setSelection(null); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); }
      else if (key === 'v') chooseTool('select');
      else if (key === 'c') chooseTool('connect');
      else if (key === 'n') { chooseTool('object'); newLabelInput.current?.focus(); }
      else if (key === 'h') chooseTool('pan');
      else if (key === 'f') setFitVersion((prev) => prev + 1);
      else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && selectedIds.length) {
        event.preventDefault();
        const step = event.shiftKey ? 1 : snap ? GRID_STEP : 0.1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0;
        update((prev) => ({ ...prev, nodes: prev.nodes.map((item) => selectedIds.includes(item.id) ? {
          ...item, x: Math.max(-1000, Math.min(1000, item.x + dx)), y: Math.max(-1000, Math.min(1000, item.y + dy))
        } : item) }), 'nudge');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [diagram, selectedIds, exportOpen, snap, deleteSelection, duplicate, undo, redo, update]);

  const loadPreset = (key: string) => {
    update(diagramPreset(key)); setSelection(null); setSource(null); setTool('select'); setFitVersion((prev) => prev + 1); setFileError('');
  };
  const align = (axis: 'x' | 'y') => {
    const mean = selectedNodes.reduce((total, item) => total + item[axis], 0) / selectedNodes.length;
    const position = snap ? Math.round(mean / GRID_STEP) * GRID_STEP : mean;
    update((prev) => ({ ...prev, nodes: prev.nodes.map((item) => selectedIds.includes(item.id) ? { ...item, [axis]: position } : item) }));
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Choose a diagram under 2 MB.');
      const next = parseDiagramFile(await file.text());
      update(next); setSelection(null); setSource(null); setTool('select'); setFileError(''); setFitVersion((prev) => prev + 1);
    } catch (error) { setFileError(error instanceof Error ? error.message : 'This diagram could not be opened.'); }
    if (fileInput.current) fileInput.current.value = '';
  };

  const hint = tool === 'connect' ? source
    ? `Click the target object. Click ${diagram.nodes.find((item) => item.id === source)?.name ?? 'the source'} again for a loop. Esc cancels.`
    : 'Click a source object, then a target object to draw an arrow.'
    : tool === 'object' ? 'Click the canvas to place an object. You can keep placing objects, then switch to Arrow.'
      : tool === 'pan' ? 'Drag the canvas to pan. Scroll to zoom.'
        : 'Drag objects to arrange them. Double-click empty space to add an object. Shift-click to select several.';
  const closeExport = useCallback(() => setExportOpen(false), []);

  return (
    <main className="diagram-workspace">
      <div className="diagram-toolbar">
        <div className="diagram-tools" role="group" aria-label="Diagram tools">
          {([
            ['select', 'Select', 'V'], ['connect', 'Arrow', 'C'], ['object', 'Object', 'N'], ['pan', 'Pan', 'H']
          ] as const).map(([value, label, shortcut]) => <button key={value} className={tool === value ? 'is-active' : ''}
            aria-pressed={tool === value} onClick={() => chooseTool(value)} title={`${label} (${shortcut})`}>
            <ToolIcon type={value} /><span>{label}</span>
          </button>)}
        </div>
        <div className="diagram-history-controls">
          <button disabled={!canUndo} onClick={() => { undo(); setSource(null); }} title="Undo (Ctrl/⌘Z)" aria-label="Undo">↶</button>
          <button disabled={!canRedo} onClick={() => { redo(); setSource(null); }} title="Redo (Ctrl/⌘Shift+Z)" aria-label="Redo">↷</button>
        </div>
        <div className="diagram-canvas-options">
          <label className="diagram-check"><input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />Grid</label>
          <label className="diagram-check"><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} />Snap</label>
        </div>
        <div className="diagram-file-controls">
          <button onClick={() => downloadText(serializeDiagram(diagram), 'commutative-diagram.json', 'application/json')} title="Save an editable diagram">Save</button>
          <button onClick={() => fileInput.current?.click()} title="Open a saved diagram">Open</button>
          <button className="diagram-primary" onClick={() => setExportOpen(true)}>Export TikZ <span aria-hidden="true">↗</span></button>
          <input type="file" ref={fileInput} accept=".json,application/json" hidden onChange={(event) => { void importFile(event.target.files?.[0]); }} />
        </div>
      </div>

      <div className="diagram-layout">
        <section className="diagram-stage" aria-label="Diagram workspace">
          <div className={`diagram-instructions ${source ? 'is-connecting' : ''}`} role="status">
            <span className="diagram-mode-dot" />{hint}
          </div>
          <DiagramCanvas diagram={diagram} selection={selection} tool={tool} source={source} grid={grid} snap={snap} fitVersion={fitVersion}
            onSelect={select} onNodeClick={connect} onAddNode={addNode}
            onMoveNodes={(positions) => preview((prev) => ({ ...prev, nodes: prev.nodes.map((item) => positions.has(item.id) ? { ...item, ...positions.get(item.id)! } : item) }))}
            onGestureEnd={commitGesture} onEditNode={() => window.setTimeout(() => nodeLabelInput.current?.focus(), 0)} />
          <div className="diagram-statusbar"><span>{diagram.nodes.length} objects · {diagram.arrows.length} arrows</span>
            <span>{saveStatus}</span><span className="diagram-status-hint">Scroll to zoom · Alt + drag to pan</span></div>
        </section>

        <aside className="diagram-sidebar" aria-label="Diagram controls">
          <section className="diagram-add-section">
            <h2>Add an object</h2>
            <form onSubmit={(event) => { event.preventDefault(); addFromForm(); }}>
              <label className="diagram-sr-only" htmlFor="new-diagram-object">New object TeX label</label>
              <input id="new-diagram-object" ref={newLabelInput} value={newLabel} onChange={(event) => setNewLabel(event.target.value)}
                placeholder="e.g. \mathcal{C}" spellCheck={false} autoComplete="off" />
              <button type="submit" aria-label="Add object" title="Add object to the canvas">+</button>
            </form>
            <p className="diagram-help">Use TeX math, like <code>{'\\mathcal{C}'}</code> or <code>{'H^n(X)'}</code>.</p>
          </section>

          <section className="diagram-inspector">
            {node ? <>
              <div className="diagram-section-heading"><h2>Object {node.name}</h2><span className="diagram-badge">Selected</span></div>
              <MathInput label="Object label" value={node.label} inputRef={nodeLabelInput}
                onChange={(value) => updateNode(node.id, { label: value }, 'label')} />
              <div className="diagram-field-row">
                <label>x (cm)<input type="number" min={-1000} max={1000} step={0.5} value={Number(node.x.toFixed(3))}
                  onChange={(event) => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) updateNode(node.id, { x: Math.max(-1000, Math.min(1000, event.target.valueAsNumber)) }, 'x'); }} /></label>
                <label>y (cm)<input type="number" min={-1000} max={1000} step={0.5} value={Number(node.y.toFixed(3))}
                  onChange={(event) => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) updateNode(node.id, { y: Math.max(-1000, Math.min(1000, event.target.valueAsNumber)) }, 'y'); }} /></label>
              </div>
              <label>TikZ name<input value={node.name} spellCheck={false}
                onChange={(event) => {
                  const name = event.target.value;
                  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) && !diagram.nodes.some((item) => item.id !== node.id && item.name === name)) updateNode(node.id, { name }, 'name');
                }} /></label>
              <p className="diagram-help">Unique name used in exported code, e.g. <code>({node.name})</code>.</p>
              <button className="diagram-connect-action" onClick={() => { setTool('connect'); setSource(node.id); }}>Draw arrow from this object →</button>
              <button onClick={() => {
                const next = createArrow(node.id, node.id, { label: 'f' });
                update((prev) => ({ ...prev, arrows: [...prev.arrows, next] })); setSelection({ kind: 'arrow', id: next.id });
              }}>Add a loop ↻</button>
            </> : arrow ? <>
              <div className="diagram-section-heading"><h2>Arrow</h2><span className="diagram-badge">Selected</span></div>
              <MathInput label="Arrow label" value={arrow.label} inputRef={arrowLabelInput}
                onChange={(value) => updateArrow(arrow.id, { label: value }, 'label')} />
              <div className="diagram-field-row">
                <label>From<select aria-label="From" value={arrow.from} onChange={(event) => updateArrow(arrow.id, { from: event.target.value })}>
                  {diagram.nodes.map((item) => <option key={item.id} value={item.id}>{item.name}: {item.label}</option>)}
                </select></label>
                <label>To<select aria-label="To" value={arrow.to} onChange={(event) => updateArrow(arrow.id, { to: event.target.value })}>
                  {diagram.nodes.map((item) => <option key={item.id} value={item.id}>{item.name}: {item.label}</option>)}
                </select></label>
              </div>
              <button onClick={() => updateArrow(arrow.id, { from: arrow.to, to: arrow.from, bend: -arrow.bend,
                labelPosition: 1 - arrow.labelPosition,
                labelSide: arrow.labelSide === 'left' ? 'right' : arrow.labelSide === 'right' ? 'left' : 'on' })}>⇄ Reverse direction</button>
              <div className="diagram-field-row">
                <label>Source tip<select aria-label="Source tip" value={arrow.start} onChange={(event) => updateArrow(arrow.id, { start: event.target.value as ArrowHead })}>
                  {HEAD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select></label>
                <label>Target tip<select aria-label="Target tip" value={arrow.end} onChange={(event) => updateArrow(arrow.id, { end: event.target.value as ArrowHead })}>
                  {HEAD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select></label>
              </div>
              <div className="diagram-arrow-presets" role="group" aria-label="Common arrow styles">
                {([
                  ['→', 'Ordinary arrow', 'none', 'arrow', 'solid'], ['↪', 'Inclusion', 'hook', 'arrow', 'solid'],
                  ['↠', 'Surjection', 'none', 'twoheads', 'solid'], ['↦', 'Maps to', 'tail', 'arrow', 'solid'],
                  ['↔', 'Both directions', 'arrow', 'arrow', 'solid'], ['=', 'Equality', 'none', 'none', 'double']
                ] as const).map(([symbol, title, start, end, style]) => <button key={title} title={title} aria-label={title}
                  onClick={() => updateArrow(arrow.id, { start, end, style })}>{symbol}</button>)}
              </div>
              <label>Line style<select aria-label="Line style" value={arrow.style} onChange={(event) => updateArrow(arrow.id, { style: event.target.value as LineStyle })}>
                <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="double">Double line</option>
              </select></label>
              {arrow.from === arrow.to ? <label>Loop direction<select aria-label="Loop direction" value={arrow.loopSide} onChange={(event) => updateArrow(arrow.id, { loopSide: event.target.value as LoopSide })}>
                <option value="above">Above</option><option value="right">Right</option><option value="below">Below</option><option value="left">Left</option>
              </select></label> : <label className="diagram-bend-label"><span>Bend <span>{arrow.bend === 0 ? 'Straight' : `${Math.abs(arrow.bend)}° ${arrow.bend > 0 ? 'left' : 'right'}`}</span></span>
                <input aria-label="Bend" type="range" min={-80} max={80} step={1} value={arrow.bend} onChange={(event) => updateArrow(arrow.id, { bend: Number(event.target.value) }, 'bend')} />
                <button className="diagram-text-button" onClick={() => updateArrow(arrow.id, { bend: 0 })}>Straighten</button>
              </label>}
              <label>Label side<select aria-label="Label side" value={arrow.labelSide} onChange={(event) => updateArrow(arrow.id, { labelSide: event.target.value as LabelSide })}>
                <option value="left">Left of path / above →</option><option value="right">Right of path / below →</option><option value="on">On the line</option>
              </select></label>
              <label>Label position<input aria-label="Label position" type="range" min={0.1} max={0.9} step={0.05} value={arrow.labelPosition}
                onChange={(event) => updateArrow(arrow.id, { labelPosition: Number(event.target.value) }, 'labelPosition')} /></label>
            </> : selectedNodes.length > 1 ? <>
              <h2>{selectedNodes.length} objects selected</h2>
              <p className="diagram-help">Drag to move the group. Align their centers or duplicate the group with its internal arrows.</p>
              <button onClick={() => align('y')}>Align in a row</button><button onClick={() => align('x')}>Align in a column</button>
            </> : <div className="diagram-inspector-empty">
              <h2>Build, connect, export</h2>
              <ol><li>Add objects with TeX labels.</li><li>Choose <strong>Arrow</strong>, then click two objects.</li><li>Click an arrow to edit its style and label.</li></ol>
              <p className="diagram-help">Objects and arrows can go anywhere. Parallel arrows and loops are welcome.</p>
            </div>}
            {(node || arrow || selectedNodes.length > 1) && <div className="diagram-selection-actions">
              <button onClick={duplicate}>Duplicate</button><button className="diagram-danger" onClick={deleteSelection}>Delete</button>
            </div>}
          </section>

          <details className="diagram-presets" open={!node && !arrow && selectedNodes.length === 0}>
            <summary>Start from a preset</summary>
            <div className="diagram-preset-grid">
              {PRESETS.map((preset) => <button key={preset.key} title={preset.description} onClick={() => loadPreset(preset.key)}>
                <PresetIcon type={preset.icon} /><span>{preset.name}</span>
              </button>)}
            </div>
            <button className="diagram-new-button" onClick={() => loadPreset('blank')}>New blank diagram</button>
            <p className="diagram-help">Presets replace the canvas. Undo brings your diagram back.</p>
          </details>
          <details className="diagram-shortcuts"><summary>Keyboard & canvas tips</summary>
            <dl><dt>V / C / N / H</dt><dd>Select / arrow / object / pan</dd><dt>Ctrl/⌘ Z</dt><dd>Undo (Shift to redo)</dd>
              <dt>Ctrl/⌘ D</dt><dd>Duplicate selection</dd><dt>Ctrl/⌘ A</dt><dd>Select all objects</dd>
              <dt>Arrow keys</dt><dd>Move selected objects</dd><dt>Delete</dt><dd>Remove selection</dd><dt>F</dt><dd>Fit diagram to canvas</dd>
              <dt>Shift + drag</dt><dd>Move without snapping</dd><dt>Alt + drag</dt><dd>Pan in any tool</dd>
            </dl>
          </details>
          {fileError && <p className="diagram-file-error" role="alert">{fileError}</p>}
        </aside>
      </div>
      {exportOpen && <DiagramExportModal diagram={diagram} onClose={closeExport} />}
    </main>
  );
}

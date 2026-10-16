import { useEffect, useRef, useState, type ReactNode } from 'react';
import GraphIcon from './GraphIcon';
import './GraphWorkspace.css';

interface GraphWorkspaceProps {
  mode: '2d' | '3d';
  expressions: ReactNode;
  controls: ReactNode;
  children: ReactNode;
  onAdd: () => void;
  onExport: () => void;
  onReset: () => void;
  onZoom: (factor: number) => void;
}

export default function GraphWorkspace({ mode, expressions, controls, children, onAdd, onExport, onReset, onZoom }: GraphWorkspaceProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const is3D = mode === '3d';

  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
        settingsButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [settingsOpen]);

  return (
    <main className={`workspace-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <aside className="left-panel" aria-label={is3D ? 'Surface expressions' : 'Graph expressions'} hidden={!sidebarOpen}>
        <div className="expression-toolbar">
          <button className="graph-icon-button add-expression-button" onClick={onAdd}
            title={is3D ? 'Add surface' : 'Add expression'} aria-label={is3D ? 'Add surface' : 'Add expression'}>
            <GraphIcon name="plus" />
          </button>
          <h2>{is3D ? 'Surfaces' : 'Expressions'}</h2>
          <button className="graph-icon-button" onClick={() => setSidebarOpen(false)}
            title="Hide expressions" aria-label="Hide expressions" aria-expanded={sidebarOpen}>
            <GraphIcon name="collapse" />
          </button>
        </div>
        {expressions}
        <div className="expression-panel-footer">
          <p>{is3D ? 'Plot a surface. Find a new perspective.' : 'Your equations, ready for LaTeX.'}</p>
          <button className="graph-export-button" onClick={onExport}>
            <GraphIcon name="export" />{is3D ? 'Export TikZ 3D' : 'Export TikZ'}
          </button>
        </div>
      </aside>

      <section className="graph-panel" aria-label={is3D ? '3D graph' : '2D graph'}>
        {children}
        {!sidebarOpen && <button className="graph-icon-button show-expressions-button" onClick={() => setSidebarOpen(true)}
          title="Show expressions" aria-label="Show expressions" aria-expanded={sidebarOpen}>
          <GraphIcon name="expand" />
        </button>}
        <div className="graph-tools">
          <div className="graph-settings-anchor" ref={settingsRef}>
            <button className={`graph-icon-button${settingsOpen ? ' is-active' : ''}`} ref={settingsButtonRef}
              onClick={() => setSettingsOpen((open) => !open)} title="Graph settings" aria-label="Graph settings"
              aria-expanded={settingsOpen} aria-controls={`graph-settings-${mode}`}>
              <GraphIcon name="settings" />
            </button>
            <div className="graph-settings" id={`graph-settings-${mode}`} hidden={!settingsOpen}>
              <div className="graph-settings-heading">
                <h2>Graph settings</h2>
                <button className="graph-icon-button" onClick={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }}
                  aria-label="Close graph settings" title="Close graph settings"><GraphIcon name="close" /></button>
              </div>
              {controls}
            </div>
          </div>
          <div className="graph-zoom-controls">
            <button className="graph-icon-button" onClick={() => onZoom(0.8)} title="Zoom in" aria-label="Zoom in"><GraphIcon name="plus" /></button>
            <button className="graph-icon-button" onClick={() => onZoom(1.25)} title="Zoom out" aria-label="Zoom out"><GraphIcon name="minus" /></button>
          </div>
          <button className="graph-icon-button" onClick={onReset} title="Reset view" aria-label="Reset view"><GraphIcon name="home" /></button>
        </div>
        <div className="graph-interaction-hint">{is3D ? 'Drag to rotate · Scroll to zoom' : 'Drag to pan · Scroll to zoom'}</div>
      </section>
    </main>
  );
}

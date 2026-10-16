import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import ControlsBar from './components/ControlsBar';
import ControlsBar3D from './components/ControlsBar3D';
import ExpressionList from './components/ExpressionList';
import ExpressionList3D from './components/ExpressionList3D';
import GraphCanvas from './components/GraphCanvas';
import GraphCanvas3D from './components/GraphCanvas3D';
import GraphWorkspace from './components/GraphWorkspace';
import TikzModal from './components/TikzModal';
import DiagramEditor from './components/DiagramEditor';
import MiscWorkspace from './components/MiscWorkspace';
import CiteGraphModal from './components/CiteGraphModal';
import { prepareMath } from './lib/mathParser';
import { prepareMath3D } from './lib/mathParser3d';
import { generateTikzExport } from './lib/tikzExport';
import { generateTikzExport3D } from './lib/tikzExport3d';
import { DEFAULT_VIEWPORT_3D, clampViewport3D, zoomCamera3D } from './lib/viewport3d';
import { clampViewport, DEFAULT_VIEWPORT, zoomAt } from './lib/viewport';
import { EXPORT_GUIDE_PATH, pageFromLocation, PAGES, type Page } from './lib/pages';
import { updatePageMetadata } from './lib/seo';
import { useTheme } from './hooks/useTheme';
import type {
  Expression,
  Expression3D,
  GraphSettings,
  GraphSettings3D,
  PreparedExpression,
  PreparedExpression3D,
  Viewport,
  Viewport3D
} from './types';

const COLORS = ['#0f766e', '#ef4444', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#dc2626'];

let expressionCounter = 0;
let expression3DCounter = 0;

function nextExpressionId() {
  expressionCounter += 1;
  return `expr-${expressionCounter}`;
}

function nextExpression3DId() {
  expression3DCounter += 1;
  return `surface-${expression3DCounter}`;
}

function createExpression(input = ''): Expression {
  return {
    id: nextExpressionId(),
    rawInput: input,
    visible: true,
    color: COLORS[expressionCounter % COLORS.length],
    lineWidth: 1.25,
    dashed: false,
    samples: 500,
    domainMin: '',
    domainMax: ''
  };
}

function createExpression3D(input = ''): Expression3D {
  return {
    id: nextExpression3DId(),
    rawInput: input,
    visible: true,
    color: COLORS[expression3DCounter % COLORS.length],
    lineWidth: 1.8,
    dashed: false,
    samples: 190,
    domainXMin: '',
    domainXMax: '',
    domainYMin: '',
    domainYMax: ''
  };
}

const INITIAL_EXPRESSIONS: Expression[] = [createExpression('x^2'), createExpression('sin(x)')];
const INITIAL_EXPRESSIONS_3D: Expression3D[] = [createExpression3D('1.6sin(sqrt(x^2+y^2))')];

function exampleExpressions(key: string): Expression[] {
  switch (key) {
    case 'parabola':
      return [createExpression('x^2 - 2*x - 3'), createExpression('0.5*x + 2')];
    case 'sine':
      return [createExpression('sin(x)'), createExpression('cos(x)')];
    case 'crra':
      return [createExpression('(x^(1-1/10.5))/(1-(1/10.5))')];
    case 'mixed':
      return [createExpression('1/(x-1)'), createExpression('exp(0.2*x)')];
    default:
      return INITIAL_EXPRESSIONS;
  }
}

function exampleExpressions3D(key: string): Expression3D[] {
  switch (key) {
    case 'paraboloid':
      return [createExpression3D('0.08*(x^2 + y^2)')];
    case 'saddle':
      return [createExpression3D('0.12*(x^2 - y^2)')];
    case 'ripples':
      return [createExpression3D('sin(sqrt(x^2 + y^2))')];
    case 'mixed':
      return [createExpression3D('sin(x)*cos(y)'), createExpression3D('0.03*(x^2 + y^2)')];
    default:
      return INITIAL_EXPRESSIONS_3D;
  }
}

function currentPage(): Page {
  if (typeof window === 'undefined') {
    return '2d';
  }
  return pageFromLocation(window.location);
}

export default function App({ initialPage }: { initialPage?: Page }) {
  const { theme, toggleTheme } = useTheme();
  const [page, setPage] = useState<Page>(() => initialPage ?? currentPage());

  const [expressions, setExpressions] = useState<Expression[]>(INITIAL_EXPRESSIONS);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [settings, setSettings] = useState<GraphSettings>({
    showGrid: true,
    showAxes: true,
    showTicks: true
  });

  const [expressions3D, setExpressions3D] = useState<Expression3D[]>(INITIAL_EXPRESSIONS_3D);
  const [viewport3D, setViewport3D] = useState<Viewport3D>(DEFAULT_VIEWPORT_3D);
  const [settings3D, setSettings3D] = useState<GraphSettings3D>({
    showGrid: true,
    showAxes: true,
    showBox: false
  });

  const [isTikzOpen, setIsTikzOpen] = useState(false);
  const [isCiteOpen, setIsCiteOpen] = useState(false);
  const [tikzMode, setTikzMode] = useState<'2d' | '3d'>('2d');
  const [exportScale, setExportScale] = useState(1.2);

  useEffect(() => {
    const onLocationChange = () => {
      const nextPage = currentPage();
      // Keep old bookmarks working while consolidating them under crawlable URLs.
      if (['#2d', '#3d', '#diagram', '#misc'].includes(window.location.hash)) {
        window.history.replaceState(null, '', `${PAGES[nextPage].path}${window.location.search}`);
      }
      setPage(nextPage);
      updatePageMetadata(nextPage);
    };
    onLocationChange();
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  const preparedExpressions = useMemo<PreparedExpression[]>(
    () =>
      expressions.map((expr) => {
        const parsed = prepareMath(expr.rawInput);
        return {
          ...expr,
          mode: parsed.mode,
          normalizedInput: parsed.normalizedInput,
          latex: parsed.latex,
          error: parsed.error,
          evaluator: parsed.evaluator,
          implicitEvaluator: parsed.implicitEvaluator,
          node: parsed.node
        };
      }),
    [expressions]
  );

  const preparedExpressions3D = useMemo<PreparedExpression3D[]>(
    () =>
      expressions3D.map((expr) => {
        const parsed = prepareMath3D(expr.rawInput);
        return {
          ...expr,
          normalizedInput: parsed.normalizedInput,
          latex: parsed.latex,
          error: parsed.error,
          evaluator: parsed.evaluator,
          node: parsed.node
        };
      }),
    [expressions3D]
  );

  const tikzCode = useMemo(
    () =>
      generateTikzExport({
        expressions: preparedExpressions,
        viewport,
        settings,
        scale: exportScale
      }),
    [preparedExpressions, settings, viewport, exportScale]
  );

  const tikzCode3D = useMemo(
    () =>
      generateTikzExport3D({
        expressions: preparedExpressions3D,
        viewport: viewport3D,
        settings: settings3D,
        scale: exportScale
      }),
    [preparedExpressions3D, settings3D, viewport3D, exportScale]
  );

  const updateExpression = (id: string, patch: Partial<Expression>) => {
    setExpressions((prev) => prev.map((expr) => (expr.id === id ? { ...expr, ...patch } : expr)));
  };

  const addExpression = () => {
    const expression = createExpression('');
    setExpressions((prev) => [...prev, expression]);
    requestAnimationFrame(() => document.getElementById(expression.id)?.focus());
  };

  const resetView = () => {
    const graph = document.querySelector('.graph-frame');
    const bounds = graph?.getBoundingClientRect();
    const aspect = bounds?.width ? bounds.height / bounds.width : 1;
    setViewport({ ...DEFAULT_VIEWPORT, yMin: DEFAULT_VIEWPORT.yMin * aspect, yMax: DEFAULT_VIEWPORT.yMax * aspect });
  };

  const removeExpression = (id: string) => {
    setExpressions((prev) => (prev.length <= 1 ? prev : prev.filter((expr) => expr.id !== id)));
  };

  const moveExpression = (id: string, direction: -1 | 1) => {
    setExpressions((prev) => {
      const index = prev.findIndex((expr) => expr.id === id);
      if (index < 0) {
        return prev;
      }

      const target = index + direction;
      if (target < 0 || target >= prev.length) {
        return prev;
      }

      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const updateExpression3D = (id: string, patch: Partial<Expression3D>) => {
    setExpressions3D((prev) => prev.map((expr) => (expr.id === id ? { ...expr, ...patch } : expr)));
  };

  const addExpression3D = () => {
    const expression = createExpression3D('');
    setExpressions3D((prev) => [...prev, expression]);
    requestAnimationFrame(() => document.getElementById(expression.id)?.focus());
  };

  const removeExpression3D = (id: string) => {
    setExpressions3D((prev) => (prev.length <= 1 ? prev : prev.filter((expr) => expr.id !== id)));
  };

  const moveExpression3D = (id: string, direction: -1 | 1) => {
    setExpressions3D((prev) => {
      const index = prev.findIndex((expr) => expr.id === id);
      if (index < 0) {
        return prev;
      }

      const target = index + direction;
      if (target < 0 || target >= prev.length) {
        return prev;
      }

      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const navigateTo = (event: MouseEvent<HTMLAnchorElement>, nextPage: Page) => {
    // Let the browser handle modified clicks and opening workspaces in new tabs.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const nextUrl = `${PAGES[nextPage].path}${window.location.search}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.pushState(null, '', nextUrl);
    }
    setPage(nextPage);
    updatePageMetadata(nextPage);
  };

  return (
    <div className="app-shell">
      <header className="top-header">
        <div>
          <h1>GraphToTeX</h1>
          <p>
            {page === '2d'
              ? 'Interactive graphing calculator with direct TikZ export.'
              : page === '3d' ? 'Interactive 3D surface graphing workspace with live controls.'
              : page === 'misc' ? 'Calculators, calculus, linear algebra, and TeX conversion tools.'
              : 'Build commutative diagrams with LaTeX labels and direct TikZ export.'}
          </p>
        </div>
        <div className="header-actions">
          <div className="page-switch" role="navigation" aria-label="Page selection">
            {(Object.entries(PAGES) as [Page, typeof PAGES[Page]][]).map(([key, metadata]) => (
              <a key={key} href={metadata.path} className={page === key ? 'is-active' : ''}
                aria-current={page === key ? 'page' : undefined} onClick={(event) => navigateTo(event, key)}>
                {key === '2d' ? '2D' : key === '3d' ? '3D' : metadata.label}
              </a>
            ))}
          </div>
          <button type="button" className="theme-toggle" onClick={toggleTheme}
            role="switch" aria-label="Dark mode" aria-checked={theme === 'dark'} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <span className="theme-toggle-thumb" aria-hidden="true" />
          </button>
        </div>
      </header>

      {page === '2d' ? (
        <GraphWorkspace mode="2d" onAdd={addExpression} onExport={() => { setTikzMode('2d'); setIsTikzOpen(true); }}
          onReset={resetView}
          onZoom={(factor) => setViewport((prev) => zoomAt(prev, (prev.xMin + prev.xMax) / 2, (prev.yMin + prev.yMax) / 2, factor))}
          controls={
            <ControlsBar
              viewport={viewport}
              settings={settings}
              onLoadExample={(example) => setExpressions(exampleExpressions(example))}
              onSettingsChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              onViewportSubmit={(next) => setViewport(clampViewport(next))}
            />
          }
          expressions={
            <ExpressionList
              expressions={preparedExpressions}
              onChange={updateExpression}
              onRemove={removeExpression}
              onMoveUp={(id) => moveExpression(id, -1)}
              onMoveDown={(id) => moveExpression(id, 1)}
            />
          }>
            <GraphCanvas
              theme={theme}
              expressions={preparedExpressions}
              viewport={viewport}
              settings={settings}
              onViewportChange={(next) => setViewport(clampViewport(next))}
            />
        </GraphWorkspace>
      ) : page === '3d' ? (
        <GraphWorkspace mode="3d" onAdd={addExpression3D} onExport={() => { setTikzMode('3d'); setIsTikzOpen(true); }}
          onReset={() => setViewport3D(DEFAULT_VIEWPORT_3D)}
          onZoom={(factor) => setViewport3D((prev) => zoomCamera3D(prev, factor))}
          controls={
            <ControlsBar3D
              viewport={viewport3D}
              settings={settings3D}
              onLoadExample={(example) => setExpressions3D(exampleExpressions3D(example))}
              onSettingsChange={(patch) => setSettings3D((prev) => ({ ...prev, ...patch }))}
              onViewportSubmit={(next) => setViewport3D(clampViewport3D(next))}
            />
          }
          expressions={
            <ExpressionList3D
              expressions={preparedExpressions3D}
              onChange={updateExpression3D}
              onRemove={removeExpression3D}
              onMoveUp={(id) => moveExpression3D(id, -1)}
              onMoveDown={(id) => moveExpression3D(id, 1)}
            />
          }>
            <GraphCanvas3D
              theme={theme}
              expressions={preparedExpressions3D}
              viewport={viewport3D}
              settings={settings3D}
              onViewportChange={(next) => setViewport3D(clampViewport3D(next))}
            />
        </GraphWorkspace>
      ) : page === 'misc' ? <MiscWorkspace /> : <DiagramEditor />}

      <footer className="app-footer">
        <span>{page === 'misc' ? 'Math tools for LaTeX' : page === 'diagram' ? 'Made for Math 221 at Harvard University' : 'Made for Econ1011b at Harvard University'}</span>
        <a className="software-license" href="https://github.com/rgrossharv/graphtotex/blob/main/LICENSE" target="_blank" rel="noreferrer">Public domain software</a>
        <a href={EXPORT_GUIDE_PATH}>Desmos to TikZ guide</a>
        <a href="https://github.com/rgrossharv/graphtotex" target="_blank" rel="noreferrer">
          GraphToTeX Repository
        </a>
        <button className="cite-graph-trigger" onClick={() => setIsCiteOpen(true)}>Cite GraphToTeX</button>
      </footer>

      <CiteGraphModal isOpen={isCiteOpen} onClose={() => setIsCiteOpen(false)} />

      <TikzModal
        isOpen={isTikzOpen}
        variant={tikzMode}
        tikzCode={tikzMode === '2d' ? tikzCode : tikzCode3D}
        scale={exportScale}
        onScaleChange={setExportScale}
        onClose={() => setIsTikzOpen(false)}
      />
    </div>
  );
}

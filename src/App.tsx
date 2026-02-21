import { useEffect, useMemo, useState } from 'react';
import ControlsBar from './components/ControlsBar';
import ControlsBar3D from './components/ControlsBar3D';
import ExpressionList from './components/ExpressionList';
import ExpressionList3D from './components/ExpressionList3D';
import GraphCanvas from './components/GraphCanvas';
import GraphCanvas3D from './components/GraphCanvas3D';
import TikzModal from './components/TikzModal';
import { prepareMath } from './lib/mathParser';
import { prepareMath3D } from './lib/mathParser3d';
import { generateTikzExport } from './lib/tikzExport';
import { generateTikzExport3D } from './lib/tikzExport3d';
import { DEFAULT_VIEWPORT_3D, clampViewport3D } from './lib/viewport3d';
import { clampViewport, DEFAULT_VIEWPORT } from './lib/viewport';
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

function initialPage(): '2d' | '3d' {
  if (typeof window === 'undefined') {
    return '2d';
  }
  return window.location.hash === '#3d' ? '3d' : '2d';
}

export default function App() {
  const [page, setPage] = useState<'2d' | '3d'>(initialPage);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia('(max-width: 980px)').matches;
  });

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
  const [tikzMode, setTikzMode] = useState<'2d' | '3d'>('2d');

  useEffect(() => {
    const onHashChange = () => setPage(window.location.hash === '#3d' ? '3d' : '2d');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 980px)');
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
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
        settings
      }),
    [preparedExpressions, settings, viewport]
  );

  const tikzCode3D = useMemo(
    () =>
      generateTikzExport3D({
        expressions: preparedExpressions3D,
        viewport: viewport3D,
        settings: settings3D
      }),
    [preparedExpressions3D, settings3D, viewport3D]
  );

  const updateExpression = (id: string, patch: Partial<Expression>) => {
    setExpressions((prev) => prev.map((expr) => (expr.id === id ? { ...expr, ...patch } : expr)));
  };

  const addExpression = () => {
    setExpressions((prev) => [...prev, createExpression('')]);
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
    setExpressions3D((prev) => [...prev, createExpression3D('')]);
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

  const navigateTo = (nextPage: '2d' | '3d') => {
    setPage(nextPage);
    window.location.hash = nextPage === '3d' ? '#3d' : '';
  };

  return (
    <div className="app-shell">
      <header className="top-header">
        <div>
          <h1>GraphToTeX</h1>
          <p>
            {page === '2d'
              ? 'Interactive graphing calculator with direct TikZ export.'
              : 'Interactive 3D surface graphing workspace with live controls.'}{' '}
            {isMobile ? <span>(Best Used on Desktop)</span> : null}
          </p>
        </div>
        <div className="page-switch" role="navigation" aria-label="Page selection">
          <button className={page === '2d' ? 'is-active' : ''} onClick={() => navigateTo('2d')}>
            2d
          </button>
          <button className={page === '3d' ? 'is-active' : ''} onClick={() => navigateTo('3d')}>
            3d
          </button>
        </div>
      </header>

      {page === '2d' ? (
        <main className="workspace-layout">
          <aside className="right-panel">
            <ControlsBar
              viewport={viewport}
              settings={settings}
              onAddExpression={addExpression}
              onExport={() => {
                setTikzMode('2d');
                setIsTikzOpen(true);
              }}
              onResetView={() => setViewport(DEFAULT_VIEWPORT)}
              onLoadExample={(example) => setExpressions(exampleExpressions(example))}
              onSettingsChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              onViewportSubmit={(next) => setViewport(clampViewport(next))}
            />
          </aside>

          <aside className="left-panel">
            <h2>Expressions</h2>
            <ExpressionList
              expressions={preparedExpressions}
              onChange={updateExpression}
              onRemove={removeExpression}
              onMoveUp={(id) => moveExpression(id, -1)}
              onMoveDown={(id) => moveExpression(id, 1)}
            />
          </aside>

          <section className="graph-panel">
            <GraphCanvas
              expressions={preparedExpressions}
              viewport={viewport}
              settings={settings}
              onViewportChange={(next) => setViewport(clampViewport(next))}
            />
          </section>
        </main>
      ) : (
        <main className="workspace-layout">
          <aside className="right-panel">
            <ControlsBar3D
              viewport={viewport3D}
              settings={settings3D}
              onAddExpression={addExpression3D}
              onExport={() => {
                setTikzMode('3d');
                setIsTikzOpen(true);
              }}
              onResetView={() => setViewport3D(DEFAULT_VIEWPORT_3D)}
              onLoadExample={(example) => setExpressions3D(exampleExpressions3D(example))}
              onSettingsChange={(patch) => setSettings3D((prev) => ({ ...prev, ...patch }))}
              onViewportSubmit={(next) => setViewport3D(clampViewport3D(next))}
            />
          </aside>

          <aside className="left-panel">
            <h2>Surfaces</h2>
            <ExpressionList3D
              expressions={preparedExpressions3D}
              onChange={updateExpression3D}
              onRemove={removeExpression3D}
              onMoveUp={(id) => moveExpression3D(id, -1)}
              onMoveDown={(id) => moveExpression3D(id, 1)}
            />
          </aside>

          <section className="graph-panel">
            <GraphCanvas3D
              expressions={preparedExpressions3D}
              viewport={viewport3D}
              settings={settings3D}
              onViewportChange={(next) => setViewport3D(clampViewport3D(next))}
            />
          </section>
        </main>
      )}

      <footer className="app-footer">
        <span>Made for Econ1011b at Harvard University</span>
        <a href="https://github.com/rgrossharv/graphtotex" target="_blank" rel="noreferrer">
          GraphToTeX Repository
        </a>
      </footer>

      <TikzModal
        isOpen={isTikzOpen}
        variant={tikzMode}
        tikzCode={tikzMode === '2d' ? tikzCode : tikzCode3D}
        onClose={() => setIsTikzOpen(false)}
      />
    </div>
  );
}

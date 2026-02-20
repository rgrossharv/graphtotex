import { useEffect, useMemo, useState } from 'react';
import ControlsBar from './components/ControlsBar';
import ExpressionList from './components/ExpressionList';
import GraphCanvas from './components/GraphCanvas';
import TikzModal from './components/TikzModal';
import { prepareMath } from './lib/mathParser';
import { generateTikzExport } from './lib/tikzExport';
import { clampViewport, DEFAULT_VIEWPORT } from './lib/viewport';
import type { Expression, GraphSettings, PreparedExpression, Viewport } from './types';

const COLORS = ['#0f766e', '#ef4444', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#dc2626'];

let expressionCounter = 0;

function nextExpressionId() {
  expressionCounter += 1;
  return `expr-${expressionCounter}`;
}

function createExpression(input = ''): Expression {
  return {
    id: nextExpressionId(),
    rawInput: input,
    visible: true,
    color: COLORS[expressionCounter % COLORS.length],
    lineWidth: 2.5,
    dashed: false,
    samples: 500,
    domainMin: '',
    domainMax: ''
  };
}

const INITIAL_EXPRESSIONS: Expression[] = [createExpression('x^2'), createExpression('sin(x)')];

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

export default function App() {
  const [expressions, setExpressions] = useState<Expression[]>(INITIAL_EXPRESSIONS);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }
    const saved = window.localStorage.getItem('graphtotex-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [settings, setSettings] = useState<GraphSettings>({
    showGrid: true,
    showAxes: true,
    showTicks: true
  });
  const [isTikzOpen, setIsTikzOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('graphtotex-theme', theme);
  }, [theme]);

  const preparedExpressions = useMemo<PreparedExpression[]>(
    () =>
      expressions.map((expr) => {
        const parsed = prepareMath(expr.rawInput);
        return {
          ...expr,
          normalizedInput: parsed.normalizedInput,
          latex: parsed.latex,
          error: parsed.error,
          evaluator: parsed.evaluator,
          node: parsed.node
        };
      }),
    [expressions]
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

  return (
    <div className="app-shell">
      <header className="top-header">
        <h1>GraphToTeX</h1>
        <p>Interactive graphing calculator with direct TikZ export.</p>
      </header>

      <ControlsBar
        viewport={viewport}
        settings={settings}
        theme={theme}
        onAddExpression={addExpression}
        onExport={() => setIsTikzOpen(true)}
        onResetView={() => setViewport(DEFAULT_VIEWPORT)}
        onLoadExample={(example) => setExpressions(exampleExpressions(example))}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        onSettingsChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
        onViewportSubmit={(next) => setViewport(clampViewport(next))}
      />

      <main className="main-layout">
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

      <footer className="app-footer">
        <span>Created by Ryland Gross</span>
        <a href="https://github.com/rylandgross/graphtotex" target="_blank" rel="noreferrer">
          GraphToTeX Repository
        </a>
      </footer>

      <TikzModal isOpen={isTikzOpen} tikzCode={tikzCode} onClose={() => setIsTikzOpen(false)} />
    </div>
  );
}

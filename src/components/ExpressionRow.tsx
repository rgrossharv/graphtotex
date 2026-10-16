import { useMemo, useState } from 'react';
import type { Expression, PreparedExpression } from '../types';
import { renderMathPreview } from '../lib/formatting';
import GraphIcon from './GraphIcon';

interface ExpressionRowProps {
  expression: PreparedExpression;
  index: number;
  total: number;
  onChange: (id: string, patch: Partial<Expression>) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

export default function ExpressionRow({
  expression,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown
}: ExpressionRowProps) {
  const [showSettings, setShowSettings] = useState(false);

  const previewHtml = useMemo(
    () => renderMathPreview(expression.latex, expression.normalizedInput || expression.rawInput),
    [expression.latex, expression.normalizedInput, expression.rawInput]
  );

  return (
    <div className={`expr-row${expression.error ? ' has-error' : ''}`}>
      <div className="expr-gutter">
        <span className="expr-number">{index + 1}</span>
        <button className={`swatch${expression.visible ? '' : ' is-hidden'}`} style={{ color: expression.color }}
          onClick={() => onChange(expression.id, { visible: !expression.visible })}
          title={expression.visible ? 'Hide expression' : 'Show expression'}
          aria-label={expression.visible ? `Hide expression ${index + 1}` : `Show expression ${index + 1}`}
          aria-pressed={expression.visible} />
      </div>
      <div className="expr-topline">
        <input
          id={expression.id}
          className="expr-input"
          aria-label={`Expression ${index + 1}`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type f(x) or equation, e.g. sin(x), x^2, y^2+x^2=1"
          value={expression.rawInput}
          onChange={(event) => onChange(expression.id, { rawInput: event.target.value })}
        />
        <div className="expr-actions">
          <button className="icon-btn" onClick={() => setShowSettings((v) => !v)} title="Expression settings"
            aria-label={`Settings for expression ${index + 1}`} aria-expanded={showSettings} aria-controls={`${expression.id}-settings`}>
            <GraphIcon name="settings" />
          </button>
          <button className="icon-btn danger" onClick={() => onRemove(expression.id)} disabled={total <= 1}
            title="Delete expression" aria-label={`Delete expression ${index + 1}`}>
            <GraphIcon name="close" />
          </button>
        </div>
      </div>

      <div className="expr-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />

      {expression.error && <div className="expr-error">{expression.error}</div>}

      {showSettings && (
        <div className="expr-settings" id={`${expression.id}-settings`}>
          <div className="expr-reorder">
            <span>Order</span>
            <button className="icon-btn" onClick={() => onMoveUp(expression.id)} disabled={index === 0} title="Move up" aria-label="Move expression up"><GraphIcon name="up" /></button>
            <button className="icon-btn" onClick={() => onMoveDown(expression.id)} disabled={index === total - 1} title="Move down" aria-label="Move expression down"><GraphIcon name="down" /></button>
          </div>
          <label>
            Domain min
            <input
              type="number"
              value={expression.domainMin}
              onChange={(event) => onChange(expression.id, { domainMin: event.target.value })}
              placeholder="auto"
            />
          </label>
          <label>
            Domain max
            <input
              type="number"
              value={expression.domainMax}
              onChange={(event) => onChange(expression.id, { domainMax: event.target.value })}
              placeholder="auto"
            />
          </label>
          <label>
            Samples ({expression.samples})
            <input
              type="range"
              min={50}
              max={2000}
              step={10}
              value={expression.samples}
              onChange={(event) =>
                onChange(expression.id, {
                  samples: Number.parseInt(event.target.value, 10)
                })
              }
            />
          </label>
          <label>
            Thickness ({expression.lineWidth.toFixed(1)} px)
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={expression.lineWidth}
              onChange={(event) =>
                onChange(expression.id, {
                  lineWidth: Number.parseFloat(event.target.value)
                })
              }
            />
          </label>
          <label>
            Color
            <input
              type="color"
              value={expression.color}
              onChange={(event) => onChange(expression.id, { color: event.target.value })}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={expression.dashed}
              onChange={(event) => onChange(expression.id, { dashed: event.target.checked })}
            />
            Dashed line
          </label>
        </div>
      )}
    </div>
  );
}

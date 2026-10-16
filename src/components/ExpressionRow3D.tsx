import { useMemo, useState } from 'react';
import type { Expression3D, PreparedExpression3D } from '../types';
import { renderMathPreview } from '../lib/formatting';
import GraphIcon from './GraphIcon';

interface ExpressionRow3DProps {
  expression: PreparedExpression3D;
  index: number;
  total: number;
  onChange: (id: string, patch: Partial<Expression3D>) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

export default function ExpressionRow3D({
  expression,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown
}: ExpressionRow3DProps) {
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
          title={expression.visible ? 'Hide surface' : 'Show surface'}
          aria-label={expression.visible ? `Hide surface ${index + 1}` : `Show surface ${index + 1}`}
          aria-pressed={expression.visible} />
      </div>
      <div className="expr-topline">
        <input
          id={expression.id}
          className="expr-input"
          aria-label={`Surface ${index + 1}`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type z=f(x,y), e.g. sin(sqrt(x^2+y^2))"
          value={expression.rawInput}
          onChange={(event) => onChange(expression.id, { rawInput: event.target.value })}
        />
        <div className="expr-actions">
          <button className="icon-btn" onClick={() => setShowSettings((v) => !v)} title="Surface settings"
            aria-label={`Settings for surface ${index + 1}`} aria-expanded={showSettings} aria-controls={`${expression.id}-settings`}>
            <GraphIcon name="settings" />
          </button>
          <button className="icon-btn danger" onClick={() => onRemove(expression.id)} disabled={total <= 1}
            title="Delete surface" aria-label={`Delete surface ${index + 1}`}>
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
            <button className="icon-btn" onClick={() => onMoveUp(expression.id)} disabled={index === 0} title="Move up" aria-label="Move surface up"><GraphIcon name="up" /></button>
            <button className="icon-btn" onClick={() => onMoveDown(expression.id)} disabled={index === total - 1} title="Move down" aria-label="Move surface down"><GraphIcon name="down" /></button>
          </div>
          <label>
            x min
            <input
              type="number"
              value={expression.domainXMin}
              onChange={(event) => onChange(expression.id, { domainXMin: event.target.value })}
              placeholder="auto"
            />
          </label>
          <label>
            x max
            <input
              type="number"
              value={expression.domainXMax}
              onChange={(event) => onChange(expression.id, { domainXMax: event.target.value })}
              placeholder="auto"
            />
          </label>
          <label>
            y min
            <input
              type="number"
              value={expression.domainYMin}
              onChange={(event) => onChange(expression.id, { domainYMin: event.target.value })}
              placeholder="auto"
            />
          </label>
          <label>
            y max
            <input
              type="number"
              value={expression.domainYMax}
              onChange={(event) => onChange(expression.id, { domainYMax: event.target.value })}
              placeholder="auto"
            />
          </label>
          <label>
            Mesh ({expression.samples})
            <input
              type="range"
              min={80}
              max={4200}
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
              min={0.5}
              max={4}
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
            Dashed wireframe
          </label>
        </div>
      )}
    </div>
  );
}

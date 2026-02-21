import { useMemo, useState } from 'react';
import type { Expression3D, PreparedExpression3D } from '../types';
import { renderMathPreview } from '../lib/formatting';

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
    <div className="expr-row">
      <div className="expr-topline">
        <button
          className="swatch"
          style={{ backgroundColor: expression.color }}
          title="Surface color"
          aria-label="Surface color"
        />
        <input
          className="expr-input"
          placeholder="Type z=f(x,y), e.g. sin(sqrt(x^2+y^2))"
          value={expression.rawInput}
          onChange={(event) => onChange(expression.id, { rawInput: event.target.value })}
        />
        <div className="expr-actions">
          <button
            className={`icon-btn visibility-btn ${expression.visible ? 'is-on' : ''}`}
            onClick={() => onChange(expression.id, { visible: !expression.visible })}
            title={expression.visible ? 'Hide surface' : 'Show surface'}
          >
            {expression.visible ? 'ON' : 'OFF'}
          </button>
          <button className="icon-btn" onClick={() => setShowSettings((v) => !v)} title="Settings">
            CFG
          </button>
          <button className="icon-btn" onClick={() => onMoveUp(expression.id)} disabled={index === 0} title="Move up">
            UP
          </button>
          <button
            className="icon-btn"
            onClick={() => onMoveDown(expression.id)}
            disabled={index === total - 1}
            title="Move down"
          >
            DN
          </button>
          <button className="icon-btn danger" onClick={() => onRemove(expression.id)} title="Delete surface">
            DEL
          </button>
        </div>
      </div>

      <div className="expr-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />

      {expression.error && <div className="expr-error">{expression.error}</div>}

      {showSettings && (
        <div className="expr-settings">
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

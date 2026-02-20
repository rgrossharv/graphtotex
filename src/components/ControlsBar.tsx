import { useEffect, useState, type KeyboardEvent } from 'react';
import type { GraphSettings, Viewport } from '../types';
import { formatNumber } from '../lib/formatting';

interface ControlsBarProps {
  viewport: Viewport;
  settings: GraphSettings;
  theme: 'light' | 'dark';
  onAddExpression: () => void;
  onExport: () => void;
  onResetView: () => void;
  onLoadExample: (example: string) => void;
  onToggleTheme: () => void;
  onSettingsChange: (patch: Partial<GraphSettings>) => void;
  onViewportSubmit: (next: Viewport) => void;
}

export default function ControlsBar({
  viewport,
  settings,
  theme,
  onAddExpression,
  onExport,
  onResetView,
  onLoadExample,
  onToggleTheme,
  onSettingsChange,
  onViewportSubmit
}: ControlsBarProps) {
  const [bounds, setBounds] = useState({
    xMin: formatNumber(viewport.xMin),
    xMax: formatNumber(viewport.xMax),
    yMin: formatNumber(viewport.yMin),
    yMax: formatNumber(viewport.yMax)
  });
  const [boundsError, setBoundsError] = useState<string | null>(null);

  useEffect(() => {
    setBounds({
      xMin: formatNumber(viewport.xMin),
      xMax: formatNumber(viewport.xMax),
      yMin: formatNumber(viewport.yMin),
      yMax: formatNumber(viewport.yMax)
    });
  }, [viewport.xMin, viewport.xMax, viewport.yMin, viewport.yMax]);

  const submitBounds = () => {
    const parsed = {
      xMin: Number.parseFloat(bounds.xMin),
      xMax: Number.parseFloat(bounds.xMax),
      yMin: Number.parseFloat(bounds.yMin),
      yMax: Number.parseFloat(bounds.yMax)
    };

    if (
      !Number.isFinite(parsed.xMin) ||
      !Number.isFinite(parsed.xMax) ||
      !Number.isFinite(parsed.yMin) ||
      !Number.isFinite(parsed.yMax)
    ) {
      setBoundsError('Bounds must be valid numbers.');
      return;
    }

    if (parsed.xMax <= parsed.xMin || parsed.yMax <= parsed.yMin) {
      setBoundsError('Max bound must be greater than min bound on each axis.');
      return;
    }

    setBoundsError(null);
    onViewportSubmit(parsed);
  };

  const onBoundsKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      submitBounds();
    }
  };

  return (
    <div className="controls-bar">
      <button onClick={onAddExpression}>+ Add Expression</button>
      <button onClick={onExport}>Export TikZ</button>
      <button onClick={onResetView}>Reset View</button>
      <button onClick={onToggleTheme}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</button>

      <label>
        Examples
        <select defaultValue="" onChange={(event) => event.target.value && onLoadExample(event.target.value)}>
          <option value="" disabled>
            Choose
          </option>
          <option value="parabola">Parabola + line</option>
          <option value="sine">Sine + cosine</option>
          <option value="crra">CRRA style power</option>
          <option value="mixed">Rational + exponential</option>
        </select>
      </label>

      <label className="checkbox-row inline">
        <input
          type="checkbox"
          checked={settings.showGrid}
          onChange={(event) => onSettingsChange({ showGrid: event.target.checked })}
        />
        Grid
      </label>
      <label className="checkbox-row inline">
        <input
          type="checkbox"
          checked={settings.showAxes}
          onChange={(event) => onSettingsChange({ showAxes: event.target.checked })}
        />
        Axes
      </label>
      <label className="checkbox-row inline">
        <input
          type="checkbox"
          checked={settings.showTicks}
          onChange={(event) => onSettingsChange({ showTicks: event.target.checked })}
        />
        Ticks
      </label>

      <div className="viewport-chip">
        x:[{formatNumber(viewport.xMin)}, {formatNumber(viewport.xMax)}] y:[{formatNumber(viewport.yMin)},{' '}
        {formatNumber(viewport.yMax)}]
      </div>

      <div className="bounds-editor">
        <span className="bounds-title">Viewport bounds</span>
        <label>
          xMin
          <input
            type="number"
            value={bounds.xMin}
            onChange={(event) => setBounds((prev) => ({ ...prev, xMin: event.target.value }))}
            onKeyDown={onBoundsKeyDown}
          />
        </label>
        <label>
          xMax
          <input
            type="number"
            value={bounds.xMax}
            onChange={(event) => setBounds((prev) => ({ ...prev, xMax: event.target.value }))}
            onKeyDown={onBoundsKeyDown}
          />
        </label>
        <label>
          yMin
          <input
            type="number"
            value={bounds.yMin}
            onChange={(event) => setBounds((prev) => ({ ...prev, yMin: event.target.value }))}
            onKeyDown={onBoundsKeyDown}
          />
        </label>
        <label>
          yMax
          <input
            type="number"
            value={bounds.yMax}
            onChange={(event) => setBounds((prev) => ({ ...prev, yMax: event.target.value }))}
            onKeyDown={onBoundsKeyDown}
          />
        </label>
        <button onClick={submitBounds}>Apply Bounds</button>
        <span className="bounds-hint">Mouse: wheel = both axes, Shift+wheel = x only, Alt+wheel = y only</span>
        {boundsError ? <span className="bounds-error">{boundsError}</span> : null}
      </div>
    </div>
  );
}

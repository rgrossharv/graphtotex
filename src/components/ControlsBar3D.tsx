import { useEffect, useState, type KeyboardEvent } from 'react';
import type { GraphSettings3D, Viewport3D } from '../types';
import { formatNumber } from '../lib/formatting';

interface ControlsBar3DProps {
  viewport: Viewport3D;
  settings: GraphSettings3D;
  onAddExpression: () => void;
  onExport: () => void;
  onResetView: () => void;
  onLoadExample: (example: string) => void;
  onSettingsChange: (patch: Partial<GraphSettings3D>) => void;
  onViewportSubmit: (next: Viewport3D) => void;
}

export default function ControlsBar3D({
  viewport,
  settings,
  onAddExpression,
  onExport,
  onResetView,
  onLoadExample,
  onSettingsChange,
  onViewportSubmit
}: ControlsBar3DProps) {
  const [bounds, setBounds] = useState({
    xMin: formatNumber(viewport.xMin),
    xMax: formatNumber(viewport.xMax),
    yMin: formatNumber(viewport.yMin),
    yMax: formatNumber(viewport.yMax),
    zMin: formatNumber(viewport.zMin),
    zMax: formatNumber(viewport.zMax)
  });
  const [boundsError, setBoundsError] = useState<string | null>(null);

  useEffect(() => {
    setBounds({
      xMin: formatNumber(viewport.xMin),
      xMax: formatNumber(viewport.xMax),
      yMin: formatNumber(viewport.yMin),
      yMax: formatNumber(viewport.yMax),
      zMin: formatNumber(viewport.zMin),
      zMax: formatNumber(viewport.zMax)
    });
  }, [viewport.xMin, viewport.xMax, viewport.yMin, viewport.yMax, viewport.zMin, viewport.zMax]);

  const submitBounds = () => {
    const parsed = {
      xMin: Number.parseFloat(bounds.xMin),
      xMax: Number.parseFloat(bounds.xMax),
      yMin: Number.parseFloat(bounds.yMin),
      yMax: Number.parseFloat(bounds.yMax),
      zMin: Number.parseFloat(bounds.zMin),
      zMax: Number.parseFloat(bounds.zMax)
    };

    if (
      !Number.isFinite(parsed.xMin) ||
      !Number.isFinite(parsed.xMax) ||
      !Number.isFinite(parsed.yMin) ||
      !Number.isFinite(parsed.yMax) ||
      !Number.isFinite(parsed.zMin) ||
      !Number.isFinite(parsed.zMax)
    ) {
      setBoundsError('Bounds must be valid numbers.');
      return;
    }

    if (parsed.xMax <= parsed.xMin || parsed.yMax <= parsed.yMin || parsed.zMax <= parsed.zMin) {
      setBoundsError('Max bound must be greater than min bound on each axis.');
      return;
    }

    setBoundsError(null);
    onViewportSubmit({
      ...viewport,
      ...parsed
    });
  };

  const onBoundsKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      submitBounds();
    }
  };

  return (
    <div className="controls-bar">
      <button onClick={onAddExpression}>+ Add Surface</button>
      <button onClick={onExport}>Export TikZ 3D</button>
      <button onClick={onResetView}>Reset View</button>

      <label>
        Examples
        <select defaultValue="" onChange={(event) => event.target.value && onLoadExample(event.target.value)}>
          <option value="" disabled>
            Choose
          </option>
          <option value="paraboloid">Paraboloid</option>
          <option value="saddle">Saddle</option>
          <option value="ripples">Circular ripples</option>
          <option value="mixed">Wave + bowl</option>
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
          checked={settings.showBox}
          onChange={(event) => onSettingsChange({ showBox: event.target.checked })}
        />
        Box
      </label>

      <div className="viewport-chip">
        x:[{formatNumber(viewport.xMin)}, {formatNumber(viewport.xMax)}] y:[{formatNumber(viewport.yMin)},
        {formatNumber(viewport.yMax)}] z:[{formatNumber(viewport.zMin)}, {formatNumber(viewport.zMax)}]
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
        <label>
          zMin
          <input
            type="number"
            value={bounds.zMin}
            onChange={(event) => setBounds((prev) => ({ ...prev, zMin: event.target.value }))}
            onKeyDown={onBoundsKeyDown}
          />
        </label>
        <label>
          zMax
          <input
            type="number"
            value={bounds.zMax}
            onChange={(event) => setBounds((prev) => ({ ...prev, zMax: event.target.value }))}
            onKeyDown={onBoundsKeyDown}
          />
        </label>
        <button onClick={submitBounds}>Apply Bounds</button>
        <span className="bounds-hint">
          Mouse: drag = rotate, wheel = camera zoom, Shift+wheel = x span, Alt+wheel = y span, Ctrl+wheel = z span
        </span>
        {boundsError ? <span className="bounds-error">{boundsError}</span> : null}
      </div>
    </div>
  );
}

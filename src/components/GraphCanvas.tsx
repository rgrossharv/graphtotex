import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import type { GraphSettings, PreparedExpression, Viewport } from '../types';
import { parseDomainBounds, sampleExpression, sampleImplicitContours } from '../lib/mathParser';
import { buildTicks, DEFAULT_VIEWPORT, panByPixels, screenToWorld, worldToScreen, zoomAt, zoomAtByAxis } from '../lib/viewport';

interface GraphCanvasProps {
  theme: 'light' | 'dark';
  expressions: PreparedExpression[];
  viewport: Viewport;
  settings: GraphSettings;
  onViewportChange: (next: Viewport) => void;
}

function drawGraph(
  canvas: HTMLCanvasElement,
  expressions: PreparedExpression[],
  viewport: Viewport,
  settings: GraphSettings
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const palette = getComputedStyle(canvas);
  const color = (name: string) => palette.getPropertyValue(name).trim();
  const width = canvas.width;
  const height = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  const xTickCount = Math.max(2, width / dpr / 95);
  const yTickCount = Math.max(2, height / dpr / 95);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color('--canvas-bg');
  ctx.fillRect(0, 0, width, height);

  if (settings.showGrid) {
    const xTicks = buildTicks(viewport.xMin, viewport.xMax, xTickCount);
    const yTicks = buildTicks(viewport.yMin, viewport.yMax, yTickCount);
    const drawGrid = (xs: number[], ys: number[], stroke: string) => {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.6 * dpr;
      ctx.beginPath();
      xs.forEach((x) => {
        const { px } = worldToScreen(x, viewport.yMin, width, height, viewport);
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      });
      ys.forEach((y) => {
        const { py } = worldToScreen(viewport.xMin, y, width, height, viewport);
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      });
      ctx.stroke();
    };
    const subdivisions = (ticks: number[]) => {
      if (ticks.length < 2) return [];
      const step = ticks[1] - ticks[0];
      return Array.from({ length: ticks.length + 1 }, (_, index) => ticks[0] + (index - 1) * step)
        .flatMap((tick) => Array.from({ length: 4 }, (_, i) => tick + step * (i + 1) / 5));
    };
    drawGrid(subdivisions(xTicks), subdivisions(yTicks), color('--graph-grid-minor'));
    drawGrid(xTicks, yTicks, color('--graph-grid'));
  }

  if (settings.showAxes) {
    const yZeroVisible = viewport.yMin <= 0 && viewport.yMax >= 0;
    const xZeroVisible = viewport.xMin <= 0 && viewport.xMax >= 0;

    ctx.strokeStyle = color('--graph-axis');
    ctx.lineWidth = 1.1 * dpr;

    if (yZeroVisible) {
      const { py } = worldToScreen(viewport.xMin, 0, width, height, viewport);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
    }

    if (xZeroVisible) {
      const { px } = worldToScreen(0, viewport.yMin, width, height, viewport);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }

    if (settings.showTicks && xZeroVisible && yZeroVisible) {
      const xTicks = buildTicks(viewport.xMin, viewport.xMax, xTickCount);
      const yTicks = buildTicks(viewport.yMin, viewport.yMax, yTickCount);

      ctx.fillStyle = color('--text');
      ctx.font = `${12 * dpr}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      xTicks.forEach((x) => {
        if (Math.abs(x) < 1e-9) {
          return;
        }

        const { px, py } = worldToScreen(x, 0, width, height, viewport);
        ctx.fillText(Number(x.toFixed(3)).toString(), Math.max(14 * dpr, Math.min(width - 14 * dpr, px)), py + 5 * dpr);
      });

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      yTicks.forEach((y) => {
        if (Math.abs(y) < 1e-9) {
          return;
        }

        const { px, py } = worldToScreen(0, y, width, height, viewport);
        ctx.fillText(Number(y.toFixed(3)).toString(), px - 5 * dpr, Math.max(9 * dpr, Math.min(height - 9 * dpr, py)));
      });
      const origin = worldToScreen(0, 0, width, height, viewport);
      ctx.textBaseline = 'top';
      ctx.fillText('0', origin.px - 5 * dpr, origin.py + 5 * dpr);
    }
  }

  expressions.forEach((expr) => {
    if (!expr.visible || expr.error) {
      return;
    }

    ctx.strokeStyle = expr.color;
    ctx.lineWidth = expr.lineWidth * window.devicePixelRatio;
    ctx.setLineDash(expr.dashed ? [10, 8] : []);

    if (expr.mode === 'implicit' && expr.implicitEvaluator) {
      const domain = parseDomainBounds(expr.domainMin, expr.domainMax, viewport);
      const bounds = { ...viewport, xMin: Math.max(domain.xMin, viewport.xMin), xMax: Math.min(domain.xMax, viewport.xMax) };
      if (bounds.xMax <= bounds.xMin) return;
      const segments = sampleImplicitContours(expr.implicitEvaluator, bounds, expr.samples);
      segments.forEach((segment) => {
        if (segment.length < 2) {
          return;
        }

        ctx.beginPath();
        segment.forEach((p, index) => {
          const { px, py } = worldToScreen(p.x, p.y, width, height, viewport);
          if (index === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        });
        ctx.stroke();
      });
      return;
    }

    if (!expr.evaluator) {
      return;
    }

    const domain = parseDomainBounds(expr.domainMin, expr.domainMax, viewport);
    const xMin = Math.max(domain.xMin, viewport.xMin);
    const xMax = Math.min(domain.xMax, viewport.xMax);

    if (xMax <= xMin) {
      return;
    }

    const segments = sampleExpression(expr.evaluator, xMin, xMax, expr.samples, viewport);

    segments.forEach((segment) => {
      if (segment.length < 2) {
        return;
      }

      ctx.beginPath();
      segment.forEach((p, index) => {
        const { px, py } = worldToScreen(p.x, p.y, width, height, viewport);
        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();
    });
  });

  ctx.setLineDash([]);
}

function normalizeWheelDelta(event: ReactWheelEvent<HTMLCanvasElement>, height: number): number {
  const modeScale =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? height
        : 1;

  const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  return dominantDelta * modeScale;
}

export default function GraphCanvas({ theme, expressions, viewport, settings, onViewportChange }: GraphCanvasProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 560, height: 560 });
  const previousSizeRef = useRef<{ width: number; height: number } | null>(null);
  const viewportRef = useRef(viewport);
  const onViewportChangeRef = useRef(onViewportChange);
  viewportRef.current = viewport;
  onViewportChangeRef.current = onViewportChange;

  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.max(1, Math.round(entry.contentRect.width));
        const height = Math.max(1, Math.round(entry.contentRect.height));
        const previous = previousSizeRef.current;
        if (previous?.width === width && previous.height === height) continue;
        const current = viewportRef.current;
        const centerX = (current.xMin + current.xMax) / 2;
        const centerY = (current.yMin + current.yMax) / 2;
        const xSpan = (current.xMax - current.xMin) * (previous ? width / previous.width : 1);
        const isDefault = current.xMin === DEFAULT_VIEWPORT.xMin && current.xMax === DEFAULT_VIEWPORT.xMax
          && current.yMin === DEFAULT_VIEWPORT.yMin && current.yMax === DEFAULT_VIEWPORT.yMax;
        const ySpan = previous
          ? (current.yMax - current.yMin) * height / previous.height
          : isDefault ? xSpan * height / width : current.yMax - current.yMin;
        previousSizeRef.current = { width, height };
        setSize({ width, height });
        onViewportChangeRef.current({ xMin: centerX - xSpan / 2, xMax: centerX + xSpan / 2,
          yMin: centerY - ySpan / 2, yMax: centerY + ySpan / 2 });
      }
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    drawGraph(canvas, expressions, viewport, settings);
  }, [expressions, settings, size, viewport, theme]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return;
      }

      const dx = event.clientX - lastPosRef.current.x;
      const dy = event.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: event.clientX, y: event.clientY };

      onViewportChange(panByPixels(viewport, dx, dy, size.width, size.height));
    };

    const onMouseUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onViewportChange, size.height, size.width, viewport]);

  const onMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    lastPosRef.current = { x: event.clientX, y: event.clientY };
  };

  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const world = screenToWorld(mouseX, mouseY, size.width, size.height, viewport);
    const normalizedDelta = Math.max(-180, Math.min(180, normalizeWheelDelta(event, size.height)));
    const factor = Math.exp(normalizedDelta * 0.0016);
    const zoomXOnly = event.shiftKey;
    const zoomYOnly = event.altKey;

    if (zoomXOnly && !zoomYOnly) {
      onViewportChange(zoomAtByAxis(viewport, world.x, world.y, factor, 1));
      return;
    }

    if (zoomYOnly && !zoomXOnly) {
      onViewportChange(zoomAtByAxis(viewport, world.x, world.y, 1, factor));
      return;
    }

    onViewportChange(zoomAt(viewport, world.x, world.y, factor));
  };

  return (
    <div className="graph-frame" ref={frameRef}>
      <div className="graph-wrap" ref={wrapperRef} style={{ width: `${size.width}px`, height: `${size.height}px` }}>
        <canvas ref={canvasRef} onMouseDown={onMouseDown} onWheel={onWheel}
          aria-label="2D graph of the visible expressions" aria-describedby="graph-description graph-expressions">
          <p id="graph-description">Interactive 2D graphing calculator for functions and implicit equations. Enter an expression
            such as sin(x), x^2, or x^2+y^2=1. Adjust graph bounds, colors, line styles, and domains,
            then use Export TikZ to copy or download LaTeX code.</p>
          <p id="graph-expressions">Visible expressions: {expressions.filter((expression) => expression.visible && !expression.error)
            .map((expression) => expression.rawInput).join('; ') || 'none'}.</p>
        </canvas>
      </div>
    </div>
  );
}

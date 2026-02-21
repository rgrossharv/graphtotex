import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import type { GraphSettings, PreparedExpression, Viewport } from '../types';
import { parseDomainBounds, sampleExpression, sampleImplicitContours } from '../lib/mathParser';
import { buildTicks, panByPixels, screenToWorld, worldToScreen, zoomAt, zoomAtByAxis } from '../lib/viewport';

interface GraphCanvasProps {
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

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f7fafc';
  ctx.fillRect(0, 0, width, height);

  if (settings.showGrid) {
    const xTicks = buildTicks(viewport.xMin, viewport.xMax, 16);
    const yTicks = buildTicks(viewport.yMin, viewport.yMax, 12);

    ctx.strokeStyle = '#d9e3ec';
    ctx.lineWidth = 1;

    xTicks.forEach((x) => {
      const { px } = worldToScreen(x, viewport.yMin, width, height, viewport);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    });

    yTicks.forEach((y) => {
      const { py } = worldToScreen(viewport.xMin, y, width, height, viewport);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
    });
  }

  if (settings.showAxes) {
    const yZeroVisible = viewport.yMin <= 0 && viewport.yMax >= 0;
    const xZeroVisible = viewport.xMin <= 0 && viewport.xMax >= 0;

    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;

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
      const xTicks = buildTicks(viewport.xMin, viewport.xMax, 16);
      const yTicks = buildTicks(viewport.yMin, viewport.yMax, 12);

      ctx.fillStyle = '#111827';
      ctx.font = '24px Manrope, sans-serif';
      ctx.lineWidth = 1;

      xTicks.forEach((x) => {
        if (Math.abs(x) < 1e-9) {
          return;
        }

        const { px, py } = worldToScreen(x, 0, width, height, viewport);
        ctx.beginPath();
        ctx.moveTo(px, py - 6);
        ctx.lineTo(px, py + 6);
        ctx.stroke();
        ctx.fillText(Number(x.toFixed(3)).toString(), px + 3, py + 20);
      });

      yTicks.forEach((y) => {
        if (Math.abs(y) < 1e-9) {
          return;
        }

        const { px, py } = worldToScreen(0, y, width, height, viewport);
        ctx.beginPath();
        ctx.moveTo(px - 6, py);
        ctx.lineTo(px + 6, py);
        ctx.stroke();
        ctx.fillText(Number(y.toFixed(3)).toString(), px + 8, py - 6);
      });
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
      const segments = sampleImplicitContours(expr.implicitEvaluator, viewport, expr.samples);
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

export default function GraphCanvas({ expressions, viewport, settings, onViewportChange }: GraphCanvasProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 560, height: 560 });

  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.max(240, Math.round(entry.contentRect.width));
        const nextHeight = Math.max(240, Math.round(entry.contentRect.height));
        const side = Math.min(nextWidth, nextHeight);
        setSize({ width: side, height: side });
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
  }, [expressions, settings, size, viewport]);

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
        <canvas ref={canvasRef} onMouseDown={onMouseDown} onWheel={onWheel} />
      </div>
    </div>
  );
}

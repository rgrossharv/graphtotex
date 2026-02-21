import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import type { GraphSettings3D, PreparedExpression3D, Viewport3D } from '../types';
import { parseSurfaceDomainBounds } from '../lib/mathParser3d';
import { buildTicks } from '../lib/viewport';
import { rotateViewport3D, scaleBounds3D, zoomCamera3D } from '../lib/viewport3d';

interface GraphCanvas3DProps {
  expressions: PreparedExpression3D[];
  viewport: Viewport3D;
  settings: GraphSettings3D;
  onViewportChange: (next: Viewport3D) => void;
}

interface ScreenPoint {
  px: number;
  py: number;
  depth: number;
}

interface SegmentStyle {
  color: string;
  width: number;
  dashed: boolean;
}

interface RenderSegment {
  a: ScreenPoint;
  b: ScreenPoint;
  depth: number;
  style: SegmentStyle;
}

interface RenderFace {
  points: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];
  depth: number;
  fillStyle: string;
}

interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;

  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);

  return { r, g, b };
}

function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function createProjector(viewport: Viewport3D, width: number, height: number) {
  const xCenter = (viewport.xMin + viewport.xMax) / 2;
  const yCenter = (viewport.yMin + viewport.yMax) / 2;
  const zCenter = (viewport.zMin + viewport.zMax) / 2;

  const xSpan = Math.max(1e-9, viewport.xMax - viewport.xMin);
  const ySpan = Math.max(1e-9, viewport.yMax - viewport.yMin);
  const zSpan = Math.max(1e-9, viewport.zMax - viewport.zMin);

  const maxSpan = Math.max(xSpan, ySpan, zSpan);
  const normalize = 2 / maxSpan;

  const cosYaw = Math.cos(viewport.yaw);
  const sinYaw = Math.sin(viewport.yaw);
  const cosPitch = Math.cos(viewport.pitch);
  const sinPitch = Math.sin(viewport.pitch);

  const cx = width / 2;
  const cy = height / 2;
  const scale = Math.min(width, height) * 0.45;

  return (x: number, y: number, z: number): ScreenPoint | null => {
    const nx = (x - xCenter) * normalize;
    const ny = (y - yCenter) * normalize;
    const nz = (z - zCenter) * normalize;

    const xYaw = nx * cosYaw - ny * sinYaw;
    const yYaw = nx * sinYaw + ny * cosYaw;
    const zYaw = nz;

    const yRot = yYaw * cosPitch - zYaw * sinPitch;
    const zRot = yYaw * sinPitch + zYaw * cosPitch;

    const distanceFromCamera = viewport.distance - zRot;
    if (distanceFromCamera <= 0.08) {
      return null;
    }

    const perspective = 1 / distanceFromCamera;

    return {
      px: cx + xYaw * perspective * scale,
      py: cy - yRot * perspective * scale,
      depth: zRot
    };
  };
}

function drawGraph3D(
  canvas: HTMLCanvasElement,
  expressions: PreparedExpression3D[],
  viewport: Viewport3D,
  settings: GraphSettings3D
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f7fafc';
  ctx.fillRect(0, 0, width, height);

  const project = createProjector(viewport, width, height);
  const faces: RenderFace[] = [];
  const segments: RenderSegment[] = [];

  const pushSegment = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    style: SegmentStyle
  ) => {
    const a = project(ax, ay, az);
    const b = project(bx, by, bz);
    if (!a || !b) {
      return;
    }

    segments.push({
      a,
      b,
      depth: (a.depth + b.depth) * 0.5,
      style
    });
  };

  const pushFace = (p0: WorldPoint, p1: WorldPoint, p2: WorldPoint, p3: WorldPoint, fillStyle: string) => {
    const q0 = project(p0.x, p0.y, p0.z);
    const q1 = project(p1.x, p1.y, p1.z);
    const q2 = project(p2.x, p2.y, p2.z);
    const q3 = project(p3.x, p3.y, p3.z);

    if (!q0 || !q1 || !q2 || !q3) {
      return;
    }

    faces.push({
      points: [q0, q1, q2, q3],
      depth: (q0.depth + q1.depth + q2.depth + q3.depth) * 0.25,
      fillStyle
    });
  };

  if (settings.showGrid) {
    const xTicks = buildTicks(viewport.xMin, viewport.xMax, 10);
    const yTicks = buildTicks(viewport.yMin, viewport.yMax, 10);

    const gridStyle: SegmentStyle = {
      color: '#d6deea',
      width: 1 * dpr,
      dashed: false
    };

    xTicks.forEach((xTick) => {
      pushSegment(xTick, viewport.yMin, 0, xTick, viewport.yMax, 0, gridStyle);
    });

    yTicks.forEach((yTick) => {
      pushSegment(viewport.xMin, yTick, 0, viewport.xMax, yTick, 0, gridStyle);
    });
  }

  if (settings.showBox) {
    const boxStyle: SegmentStyle = {
      color: '#b5c4d8',
      width: 1 * dpr,
      dashed: true
    };

    const x0 = viewport.xMin;
    const x1 = viewport.xMax;
    const y0 = viewport.yMin;
    const y1 = viewport.yMax;
    const z0 = viewport.zMin;
    const z1 = viewport.zMax;

    pushSegment(x0, y0, z0, x1, y0, z0, boxStyle);
    pushSegment(x1, y0, z0, x1, y1, z0, boxStyle);
    pushSegment(x1, y1, z0, x0, y1, z0, boxStyle);
    pushSegment(x0, y1, z0, x0, y0, z0, boxStyle);

    pushSegment(x0, y0, z1, x1, y0, z1, boxStyle);
    pushSegment(x1, y0, z1, x1, y1, z1, boxStyle);
    pushSegment(x1, y1, z1, x0, y1, z1, boxStyle);
    pushSegment(x0, y1, z1, x0, y0, z1, boxStyle);

    pushSegment(x0, y0, z0, x0, y0, z1, boxStyle);
    pushSegment(x1, y0, z0, x1, y0, z1, boxStyle);
    pushSegment(x1, y1, z0, x1, y1, z1, boxStyle);
    pushSegment(x0, y1, z0, x0, y1, z1, boxStyle);
  }

  if (settings.showAxes) {
    const axisWidth = 1.8 * dpr;
    pushSegment(viewport.xMin, 0, 0, viewport.xMax, 0, 0, {
      color: '#d94646',
      width: axisWidth,
      dashed: false
    });
    pushSegment(0, viewport.yMin, 0, 0, viewport.yMax, 0, {
      color: '#2563eb',
      width: axisWidth,
      dashed: false
    });
    pushSegment(0, 0, viewport.zMin, 0, 0, viewport.zMax, {
      color: '#0f766e',
      width: axisWidth,
      dashed: false
    });
  }

  expressions.forEach((expr) => {
    if (!expr.visible || !expr.evaluator || expr.error) {
      return;
    }

    const xDomain = parseSurfaceDomainBounds(expr.domainXMin, expr.domainXMax, viewport.xMin, viewport.xMax);
    const yDomain = parseSurfaceDomainBounds(expr.domainYMin, expr.domainYMax, viewport.yMin, viewport.yMax);

    const xMin = Math.max(xDomain.min, viewport.xMin);
    const xMax = Math.min(xDomain.max, viewport.xMax);
    const yMin = Math.max(yDomain.min, viewport.yMin);
    const yMax = Math.min(yDomain.max, viewport.yMax);

    if (xMax <= xMin || yMax <= yMin) {
      return;
    }

    const resolution = Math.max(12, Math.min(80, Math.round(Math.sqrt(expr.samples) * 1.35)));
    const xCount = resolution;
    const yCount = resolution;

    const xStep = (xMax - xMin) / xCount;
    const yStep = (yMax - yMin) / yCount;

    const grid: Array<Array<WorldPoint | null>> = Array.from({ length: yCount + 1 }, () =>
      Array.from({ length: xCount + 1 }, () => null)
    );

    for (let yi = 0; yi <= yCount; yi += 1) {
      const y = yMin + yi * yStep;

      for (let xi = 0; xi <= xCount; xi += 1) {
        const x = xMin + xi * xStep;
        const z = expr.evaluator(x, y);

        if (z === null || !Number.isFinite(z) || Math.abs(z) > 1e7 || z < viewport.zMin || z > viewport.zMax) {
          continue;
        }

        grid[yi][xi] = { x, y, z };
      }
    }

    const style: SegmentStyle = {
      color: expr.color,
      width: expr.lineWidth * dpr,
      dashed: expr.dashed
    };

    const surfaceFill = rgbaFromHex(expr.color, expr.dashed ? 0.14 : 0.24);

    for (let yi = 0; yi < yCount; yi += 1) {
      for (let xi = 0; xi < xCount; xi += 1) {
        const p00 = grid[yi][xi];
        const p10 = grid[yi][xi + 1];
        const p11 = grid[yi + 1][xi + 1];
        const p01 = grid[yi + 1][xi];

        if (!p00 || !p10 || !p11 || !p01) {
          continue;
        }

        pushFace(p00, p10, p11, p01, surfaceFill);
      }
    }

    for (let yi = 0; yi <= yCount; yi += 1) {
      for (let xi = 0; xi < xCount; xi += 1) {
        const a = grid[yi][xi];
        const b = grid[yi][xi + 1];
        if (!a || !b) {
          continue;
        }

        pushSegment(a.x, a.y, a.z, b.x, b.y, b.z, style);
      }
    }

    for (let xi = 0; xi <= xCount; xi += 1) {
      for (let yi = 0; yi < yCount; yi += 1) {
        const a = grid[yi][xi];
        const b = grid[yi + 1][xi];
        if (!a || !b) {
          continue;
        }

        pushSegment(a.x, a.y, a.z, b.x, b.y, b.z, style);
      }
    }
  });

  faces.sort((a, b) => a.depth - b.depth);
  faces.forEach((face) => {
    ctx.fillStyle = face.fillStyle;
    ctx.beginPath();
    ctx.moveTo(face.points[0].px, face.points[0].py);
    ctx.lineTo(face.points[1].px, face.points[1].py);
    ctx.lineTo(face.points[2].px, face.points[2].py);
    ctx.lineTo(face.points[3].px, face.points[3].py);
    ctx.closePath();
    ctx.fill();
  });

  segments.sort((a, b) => a.depth - b.depth);

  let prevColor = '';
  let prevWidth = -1;
  let prevDashed: boolean | null = null;

  segments.forEach((segment) => {
    if (segment.style.color !== prevColor) {
      ctx.strokeStyle = segment.style.color;
      prevColor = segment.style.color;
    }

    if (segment.style.width !== prevWidth) {
      ctx.lineWidth = segment.style.width;
      prevWidth = segment.style.width;
    }

    if (segment.style.dashed !== prevDashed) {
      ctx.setLineDash(segment.style.dashed ? [8 * dpr, 6 * dpr] : []);
      prevDashed = segment.style.dashed;
    }

    ctx.beginPath();
    ctx.moveTo(segment.a.px, segment.a.py);
    ctx.lineTo(segment.b.px, segment.b.py);
    ctx.stroke();
  });

  ctx.setLineDash([]);

  if (settings.showAxes) {
    ctx.fillStyle = '#111827';
    ctx.font = `${12 * dpr}px Manrope, sans-serif`;

    const xLabel = project(viewport.xMax, 0, 0);
    const yLabel = project(0, viewport.yMax, 0);
    const zLabel = project(0, 0, viewport.zMax);

    if (xLabel) {
      ctx.fillText('x', xLabel.px + 4 * dpr, xLabel.py + 4 * dpr);
    }
    if (yLabel) {
      ctx.fillText('y', yLabel.px + 4 * dpr, yLabel.py + 4 * dpr);
    }
    if (zLabel) {
      ctx.fillText('z', zLabel.px + 4 * dpr, zLabel.py - 4 * dpr);
    }
  }
}

export default function GraphCanvas3D({ expressions, viewport, settings, onViewportChange }: GraphCanvas3DProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 640, height: 640 });

  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.max(260, Math.round(entry.contentRect.width));
        const nextHeight = Math.max(260, Math.round(entry.contentRect.height));
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

    drawGraph3D(canvas, expressions, viewport, settings);
  }, [expressions, settings, size, viewport]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return;
      }

      const dx = event.clientX - lastPosRef.current.x;
      const dy = event.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: event.clientX, y: event.clientY };

      onViewportChange(rotateViewport3D(viewport, dx * 0.009, -dy * 0.009));
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
  }, [onViewportChange, viewport]);

  const onMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    lastPosRef.current = { x: event.clientX, y: event.clientY };
  };

  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const normalizedDelta = Math.max(-220, Math.min(220, normalizeWheelDelta(event, size.height)));
    const factor = Math.exp(normalizedDelta * 0.00155);

    if (event.shiftKey) {
      onViewportChange(scaleBounds3D(viewport, factor, { x: true }));
      return;
    }

    if (event.altKey) {
      onViewportChange(scaleBounds3D(viewport, factor, { y: true }));
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      onViewportChange(scaleBounds3D(viewport, factor, { z: true }));
      return;
    }

    onViewportChange(zoomCamera3D(viewport, factor));
  };

  return (
    <div className="graph-frame" ref={frameRef}>
      <div
        className="graph-wrap graph-wrap-3d"
        ref={wrapperRef}
        style={{ width: `${size.width}px`, height: `${size.height}px` }}
      >
        <canvas ref={canvasRef} onMouseDown={onMouseDown} onWheel={onWheel} />
      </div>
    </div>
  );
}

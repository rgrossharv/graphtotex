import type { Viewport } from '../types';

export const DEFAULT_VIEWPORT: Viewport = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10
};

const MIN_SPAN = 1e-3;
const MAX_SPAN = 1e6;

export function clampViewport(viewport: Viewport): Viewport {
  const sanitizeAxis = (min: number, max: number): { min: number; max: number } => {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: -10, max: 10 };
    }

    let span = Math.abs(max - min);
    const center = (min + max) / 2;

    if (span < MIN_SPAN) {
      span = MIN_SPAN;
    }
    if (span > MAX_SPAN) {
      span = MAX_SPAN;
    }

    return {
      min: center - span / 2,
      max: center + span / 2
    };
  };

  const x = sanitizeAxis(viewport.xMin, viewport.xMax);
  const y = sanitizeAxis(viewport.yMin, viewport.yMax);
  return {
    xMin: x.min,
    xMax: x.max,
    yMin: y.min,
    yMax: y.max
  };
}

export function screenToWorld(
  px: number,
  py: number,
  width: number,
  height: number,
  viewport: Viewport
): { x: number; y: number } {
  const x = viewport.xMin + (px / width) * (viewport.xMax - viewport.xMin);
  const y = viewport.yMax - (py / height) * (viewport.yMax - viewport.yMin);
  return { x, y };
}

export function worldToScreen(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: Viewport
): { px: number; py: number } {
  const px = ((x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * width;
  const py = ((viewport.yMax - y) / (viewport.yMax - viewport.yMin)) * height;
  return { px, py };
}

export function panByPixels(
  viewport: Viewport,
  dx: number,
  dy: number,
  width: number,
  height: number
): Viewport {
  const xSpan = viewport.xMax - viewport.xMin;
  const ySpan = viewport.yMax - viewport.yMin;
  const xShift = (dx / width) * xSpan;
  const yShift = (dy / height) * ySpan;

  return clampViewport({
    xMin: viewport.xMin - xShift,
    xMax: viewport.xMax - xShift,
    yMin: viewport.yMin + yShift,
    yMax: viewport.yMax + yShift
  });
}

export function zoomAt(
  viewport: Viewport,
  worldX: number,
  worldY: number,
  zoomFactor: number
): Viewport {
  const xMin = worldX + (viewport.xMin - worldX) * zoomFactor;
  const xMax = worldX + (viewport.xMax - worldX) * zoomFactor;
  const yMin = worldY + (viewport.yMin - worldY) * zoomFactor;
  const yMax = worldY + (viewport.yMax - worldY) * zoomFactor;

  return clampViewport({ xMin, xMax, yMin, yMax });
}

export function zoomAtByAxis(
  viewport: Viewport,
  worldX: number,
  worldY: number,
  zoomFactorX: number,
  zoomFactorY: number
): Viewport {
  const xMin = worldX + (viewport.xMin - worldX) * zoomFactorX;
  const xMax = worldX + (viewport.xMax - worldX) * zoomFactorX;
  const yMin = worldY + (viewport.yMin - worldY) * zoomFactorY;
  const yMax = worldY + (viewport.yMax - worldY) * zoomFactorY;
  return clampViewport({ xMin, xMax, yMin, yMax });
}

export function getNiceTickStep(range: number, maxTicks: number): number {
  if (!Number.isFinite(range) || range <= 0 || maxTicks <= 0) {
    return 1;
  }

  const rough = range / maxTicks;
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / pow10;

  if (normalized <= 1) {
    return pow10;
  }
  if (normalized <= 2) {
    return 2 * pow10;
  }
  if (normalized <= 5) {
    return 5 * pow10;
  }
  return 10 * pow10;
}

export function buildTicks(min: number, max: number, maxTicks: number): number[] {
  const step = getNiceTickStep(max - min, maxTicks);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];

  for (let t = start; t <= max + step * 0.5; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }

  return ticks;
}

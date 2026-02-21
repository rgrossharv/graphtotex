import type { Viewport3D } from '../types';

const MIN_SPAN = 1e-3;
const MAX_SPAN = 1e6;
const MIN_DISTANCE = 1.35;
const MAX_DISTANCE = 18;
const MIN_PITCH = -1.45;
const MAX_PITCH = 1.45;

export const DEFAULT_VIEWPORT_3D: Viewport3D = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
  zMin: -10,
  zMax: 10,
  yaw: 0.95,
  pitch: -0.55,
  distance: 3.35
};

function sanitizeAxis(min: number, max: number): { min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: -10, max: 10 };
  }

  const center = (min + max) / 2;
  let span = Math.abs(max - min);

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
}

export function clampViewport3D(viewport: Viewport3D): Viewport3D {
  const x = sanitizeAxis(viewport.xMin, viewport.xMax);
  const y = sanitizeAxis(viewport.yMin, viewport.yMax);
  const z = sanitizeAxis(viewport.zMin, viewport.zMax);

  const yaw = Number.isFinite(viewport.yaw) ? viewport.yaw : DEFAULT_VIEWPORT_3D.yaw;
  const pitchRaw = Number.isFinite(viewport.pitch) ? viewport.pitch : DEFAULT_VIEWPORT_3D.pitch;
  const distanceRaw = Number.isFinite(viewport.distance) ? viewport.distance : DEFAULT_VIEWPORT_3D.distance;

  return {
    xMin: x.min,
    xMax: x.max,
    yMin: y.min,
    yMax: y.max,
    zMin: z.min,
    zMax: z.max,
    yaw,
    pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitchRaw)),
    distance: Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distanceRaw))
  };
}

export function rotateViewport3D(viewport: Viewport3D, deltaYaw: number, deltaPitch: number): Viewport3D {
  return clampViewport3D({
    ...viewport,
    yaw: viewport.yaw + deltaYaw,
    pitch: viewport.pitch + deltaPitch
  });
}

export function zoomCamera3D(viewport: Viewport3D, zoomFactor: number): Viewport3D {
  return clampViewport3D({
    ...viewport,
    distance: viewport.distance * zoomFactor
  });
}

export function scaleBounds3D(
  viewport: Viewport3D,
  zoomFactor: number,
  axes: { x?: boolean; y?: boolean; z?: boolean }
): Viewport3D {
  const next = { ...viewport };

  if (axes.x) {
    const center = (viewport.xMin + viewport.xMax) / 2;
    const half = ((viewport.xMax - viewport.xMin) * zoomFactor) / 2;
    next.xMin = center - half;
    next.xMax = center + half;
  }

  if (axes.y) {
    const center = (viewport.yMin + viewport.yMax) / 2;
    const half = ((viewport.yMax - viewport.yMin) * zoomFactor) / 2;
    next.yMin = center - half;
    next.yMax = center + half;
  }

  if (axes.z) {
    const center = (viewport.zMin + viewport.zMax) / 2;
    const half = ((viewport.zMax - viewport.zMin) * zoomFactor) / 2;
    next.zMin = center - half;
    next.zMax = center + half;
  }

  return clampViewport3D(next);
}

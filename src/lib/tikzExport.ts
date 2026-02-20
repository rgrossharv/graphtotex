import type { GraphSettings, PreparedExpression, Viewport } from '../types';
import { parseDomainBounds, sampleExpression } from './mathParser';
import { convertAstToTikz } from './tikzExpr';
import { buildTicks, getNiceTickStep } from './viewport';
import { formatNumber } from './formatting';

interface TikzExportInput {
  expressions: PreparedExpression[];
  viewport: Viewport;
  settings: GraphSettings;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;

  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);

  return { r, g, b };
}

function tikzColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `{rgb,255:red,${r};green,${g};blue,${b}}`;
}

function lineStyle(expr: PreparedExpression): string {
  const parts = [`line width=${expr.lineWidth.toFixed(2)}pt`, `draw=${tikzColor(expr.color)}`];
  if (expr.dashed) {
    parts.push('dash pattern=on 5pt off 3pt');
  }
  return parts.join(', ');
}

function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) {
    return arr;
  }

  const result: T[] = [];
  const step = (arr.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}

function buildGridAndAxes(viewport: Viewport, settings: GraphSettings): string[] {
  const lines: string[] = [];
  const xRange = viewport.xMax - viewport.xMin;
  const yRange = viewport.yMax - viewport.yMin;

  if (settings.showGrid) {
    const xStep = getNiceTickStep(xRange, 16);
    const yStep = getNiceTickStep(yRange, 12);

    lines.push(`% Grid (${formatNumber(xStep)} x ${formatNumber(yStep)})`);
    lines.push(
      `\\draw[step=${formatNumber(xStep)}, gray!25, very thin] (${formatNumber(viewport.xMin)},${formatNumber(
        viewport.yMin
      )}) grid (${formatNumber(viewport.xMax)},${formatNumber(viewport.yMax)});`
    );
  }

  if (settings.showAxes) {
    const yInView = viewport.yMin <= 0 && viewport.yMax >= 0;
    const xInView = viewport.xMin <= 0 && viewport.xMax >= 0;

    if (yInView) {
      lines.push(
        `\\draw[->, semithick] (${formatNumber(viewport.xMin)},0) -- (${formatNumber(viewport.xMax)},0) node[right] {$x$};`
      );
    }

    if (xInView) {
      lines.push(
        `\\draw[->, semithick] (0,${formatNumber(viewport.yMin)}) -- (0,${formatNumber(viewport.yMax)}) node[above] {$y$};`
      );
    }

    if (settings.showTicks && xInView && yInView) {
      const xTicks = buildTicks(viewport.xMin, viewport.xMax, 16);
      const yTicks = buildTicks(viewport.yMin, viewport.yMax, 12);
      const tickSize = Math.min(xRange, yRange) * 0.008;

      xTicks.forEach((tick) => {
        if (Math.abs(tick) < 1e-9) {
          return;
        }

        lines.push(
          `\\draw (${formatNumber(tick)},${formatNumber(-tickSize)}) -- (${formatNumber(tick)},${formatNumber(
            tickSize
          )}) node[below] {\\tiny ${formatNumber(tick)}};`
        );
      });

      yTicks.forEach((tick) => {
        if (Math.abs(tick) < 1e-9) {
          return;
        }

        lines.push(
          `\\draw (${formatNumber(-tickSize)},${formatNumber(tick)}) -- (${formatNumber(tickSize)},${formatNumber(
            tick
          )}) node[left] {\\tiny ${formatNumber(tick)}};`
        );
      });
    }
  }

  return lines;
}

function buildFrameAndWatermark(viewport: Viewport): string[] {
  const xRange = Math.max(1e-9, viewport.xMax - viewport.xMin);
  const yRange = Math.max(1e-9, viewport.yMax - viewport.yMin);
  const inset = Math.min(xRange, yRange) * 0.0025;
  const xInset = Math.min(inset, xRange * 0.25);
  const yInset = Math.min(inset, yRange * 0.25);
  const watermarkPadX = xRange * 0.015;
  const watermarkPadY = yRange * 0.015;

  return [
    '% Frame border',
    `\\draw[gray!65, line width=0.35pt] (${formatNumber(viewport.xMin + xInset)},${formatNumber(
      viewport.yMin + yInset
    )}) rectangle (${formatNumber(viewport.xMax - xInset)},${formatNumber(viewport.yMax - yInset)});`,
    '% Watermark',
    `\\node[anchor=south east, text=gray!60, font=\\scriptsize] at (${formatNumber(
      viewport.xMax - watermarkPadX
    )},${formatNumber(viewport.yMin + watermarkPadY)}) {Made using GraphToTeX};`
  ];
}

function expressionToTikz(expr: PreparedExpression, viewport: Viewport): string[] {
  if (!expr.visible || !expr.evaluator || expr.error) {
    return [];
  }

  const domain = parseDomainBounds(expr.domainMin, expr.domainMax, viewport);
  const clampedDomain = {
    xMin: Math.max(domain.xMin, viewport.xMin),
    xMax: Math.min(domain.xMax, viewport.xMax)
  };

  if (clampedDomain.xMax <= clampedDomain.xMin) {
    return [`% Skipped ${expr.rawInput}: domain is outside viewport.`];
  }

  const style = lineStyle(expr);
  const symbolic = convertAstToTikz(expr.node);

  if (symbolic.ok && symbolic.expression) {
    const sampleCount = Math.max(40, Math.min(1200, Math.round(expr.samples)));
    return [
      `\\draw[${style}, domain=${formatNumber(clampedDomain.xMin)}:${formatNumber(
        clampedDomain.xMax
      )}, samples=${sampleCount}, smooth, variable=\\x]`,
      `  plot ({\\x},{${symbolic.expression}});`
    ];
  }

  const segments = sampleExpression(
    expr.evaluator,
    clampedDomain.xMin,
    clampedDomain.xMax,
    expr.samples,
    viewport
  );

  const lines: string[] = [];
  lines.push(`% ${expr.rawInput} exported as coordinates (${symbolic.reason ?? 'fallback'}).`);

  segments.forEach((segment) => {
    const slim = downsample(segment, 800);
    const coords = slim
      .map((p) => `(${formatNumber(p.x)},${formatNumber(p.y)})`)
      .join(' ');

    lines.push(`\\draw[${style}] plot coordinates {${coords}};`);
  });

  return lines;
}

export function generateTikzExport({ expressions, viewport, settings }: TikzExportInput): string {
  const header = [
    '% GraphToTeX export',
    '% Scale tip: add scale=<value> in tikzpicture options, e.g. \\begin{tikzpicture}[scale=0.8, ...]',
    '% Required packages: \\usepackage{tikz} and \\usetikzlibrary{arrows.meta}',
    '% Note: trig/inverse trig expressions are exported as sampled coordinates to preserve radian behavior.',
    '\\begin{tikzpicture}[line cap=round, line join=round, >=Stealth]',
    `\\clip (${formatNumber(viewport.xMin)},${formatNumber(viewport.yMin)}) rectangle (${formatNumber(
      viewport.xMax
    )},${formatNumber(viewport.yMax)});`
  ];

  const body = [...buildGridAndAxes(viewport, settings)];

  expressions.forEach((expr) => {
    body.push(...expressionToTikz(expr, viewport));
  });

  body.push(...buildFrameAndWatermark(viewport));

  return [...header, ...body, '\\end{tikzpicture}'].join('\n');
}

import type { GraphSettings3D, PreparedExpression3D, Viewport3D } from '../types';
import { parseSurfaceDomainBounds } from './mathParser3d';
import { formatNumber } from './formatting';
import { convertAstToTikz3D } from './tikzExpr3d';

interface TikzExport3DInput {
  expressions: PreparedExpression3D[];
  viewport: Viewport3D;
  settings: GraphSettings3D;
  scale?: number;
  aspectRatio?: number;
  equalAxes?: boolean;
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

function surfaceToTikz(expr: PreparedExpression3D, viewport: Viewport3D, index: number): string[] {
  if (!expr.visible || !expr.evaluator || expr.error) {
    return [];
  }

  const xDomain = parseSurfaceDomainBounds(expr.domainXMin, expr.domainXMax, viewport.xMin, viewport.xMax);
  const yDomain = parseSurfaceDomainBounds(expr.domainYMin, expr.domainYMax, viewport.yMin, viewport.yMax);

  const xMin = Math.max(xDomain.min, viewport.xMin);
  const xMax = Math.min(xDomain.max, viewport.xMax);
  const yMin = Math.max(yDomain.min, viewport.yMin);
  const yMax = Math.min(yDomain.max, viewport.yMax);

  if (xMax <= xMin || yMax <= yMin) {
    return [`% Skipped ${expr.rawInput}: domain is outside viewport.`];
  }

  const symbolic = convertAstToTikz3D(expr.node);
  const sampleDensity = Math.max(12, Math.min(80, Math.round(Math.sqrt(expr.samples) * 1.35)));
  const color = tikzColor(expr.color);
  const { r, g, b } = hexToRgb(expr.color);
  const style = `surf, shader=faceted, colormap={surface${index}}{rgb255(0cm)=(${r},${g},${b}); rgb255(1cm)=(${r},${g},${b})}, faceted color=${color}, fill opacity=${expr.dashed ? '0.14' : '0.24'}, draw opacity=0.85, line width=${(expr.lineWidth * 0.45).toFixed(2)}pt${expr.dashed ? ', dashed' : ''}, unbounded coords=jump`;
  const comment = `% Surface ${index + 1}: z = ${expr.rawInput.replace(/[\r\n]/g, ' ')}`;

  const cols = sampleDensity;
  const rows = cols;
  const dx = (xMax - xMin) / cols;
  const dy = (yMax - yMin) / rows;

  const dataLines: string[] = [];
  let hasHoles = false;
  let validPoints = 0;

  for (let yi = 0; yi <= rows; yi += 1) {
    const y = yMin + yi * dy;

    for (let xi = 0; xi <= cols; xi += 1) {
      const x = xMin + xi * dx;
      const z = expr.evaluator(x, y);

      const zText =
        z === null || !Number.isFinite(z) || Math.abs(z) > 1e7 || z < viewport.zMin || z > viewport.zMax
          ? 'nan'
          : formatNumber(z);
      if (zText === 'nan') hasHoles = true;
      else validPoints++;

      dataLines.push(`${formatNumber(x)} ${formatNumber(y)} ${zText}`);
    }

  }

  if (!validPoints) return [`% Skipped surface ${index + 1}: no finite points inside the visible bounds.`];

  if (symbolic.ok && symbolic.expression && !hasHoles) {
    return [comment,
      `\\addplot3[${style}, domain=${formatNumber(xMin)}:${formatNumber(xMax)}, y domain=${formatNumber(yMin)}:${formatNumber(yMax)}, samples=${sampleDensity + 1}, samples y=${sampleDensity + 1}]`,
      `{${symbolic.expression}};`
    ];
  }

  return [
    comment,
    `% Sampled coordinates: ${hasHoles ? 'preserves undefined values and visible z limits' : symbolic.reason ?? 'symbolic conversion unavailable'}.`,
    `\\addplot3[${style}, mesh/ordering=x varies, mesh/rows=${rows + 1}, mesh/cols=${cols + 1}]`,
    'table[row sep=\\\\] {',
    '  x y z\\\\',
    ...dataLines.map((line) => `  ${line}\\\\`),
    '};'
  ];
}

function boxLines(viewport: Viewport3D): string[] {
  const corners = [
    [viewport.xMin, viewport.yMin, viewport.zMin], [viewport.xMax, viewport.yMin, viewport.zMin],
    [viewport.xMin, viewport.yMax, viewport.zMin], [viewport.xMax, viewport.yMax, viewport.zMin],
    [viewport.xMin, viewport.yMin, viewport.zMax], [viewport.xMax, viewport.yMin, viewport.zMax],
    [viewport.xMin, viewport.yMax, viewport.zMax], [viewport.xMax, viewport.yMax, viewport.zMax]
  ];
  return corners.flatMap((corner, index) => [1, 2, 4].filter((bit) => (index & bit) === 0).map((bit) =>
    `\\addplot3[gray!45, thin, mark=none, forget plot] coordinates {(${corner.map(formatNumber).join(',')}) (${corners[index | bit].map(formatNumber).join(',')})};`
  ));
}

export function generateTikzExport3D({ expressions, viewport, settings, scale = 1.2, aspectRatio = 1, equalAxes = true }: TikzExport3DInput): string {
  // Convert the preview's xy projection into PGFPlots' xz projection.
  const azimuth = ((-viewport.yaw * 180 / Math.PI) % 360 + 360) % 360;
  const elevation = 90 + viewport.pitch * 180 / Math.PI;

  const axisLines = settings.showAxes ? 'middle' : 'none';
  const grid = settings.showGrid ? 'both' : 'none';

  const header = [
    '% GraphToTeX 3D export (pgfplots)',
    '% Required packages: \\usepackage{pgfplots} and \\pgfplotsset{compat=1.18}',
    '% PGFPlots uses orthographic projection; the browser preview uses perspective.',
    '\\begin{center}',
    '\\begin{tikzpicture}',
    `\\begin{axis}[view={${formatNumber(azimuth)}}{${formatNumber(elevation)}}, grid=${grid}, axis lines=${axisLines}, z buffer=sort,`,
    `  xmin=${formatNumber(viewport.xMin)}, xmax=${formatNumber(viewport.xMax)},`,
    `  ymin=${formatNumber(viewport.yMin)}, ymax=${formatNumber(viewport.yMax)},`,
    `  zmin=${formatNumber(viewport.zMin)}, zmax=${formatNumber(viewport.zMax)},`,
    `  width=${formatNumber(9 * scale)}cm, height=${formatNumber((aspectRatio ? 9 / aspectRatio : 7) * scale)}cm, scale only axis,`,
    ...(equalAxes ? ['  axis equal image,'] : []),
    settings.showAxes ? '  xlabel={$x$}, ylabel={$y$}, zlabel={$z$},' : '  xticklabels=\\empty, yticklabels=\\empty, zticklabels=\\empty, tick style={draw=none},',
    '  enlargelimits=false, clip=true, clip mode=individual]'
  ];

  const body: string[] = [];

  expressions.forEach((expr, index) => {
    body.push(...surfaceToTikz(expr, viewport, index));
  });

  if (body.length === 0) {
    body.push('% No visible valid surfaces to export.');
  }

  if (settings.showBox) body.push('% Bounding box', ...boxLines(viewport));
  const footer = ['\\end{axis}', '\\end{tikzpicture}', '\\end{center}'];

  return [...header, ...body, ...footer].join('\n');
}

import type { GraphSettings3D, PreparedExpression3D, Viewport3D } from '../types';
import { parseSurfaceDomainBounds } from './mathParser3d';
import { formatNumber } from './formatting';
import { convertAstToTikz3D } from './tikzExpr3d';

interface TikzExport3DInput {
  expressions: PreparedExpression3D[];
  viewport: Viewport3D;
  settings: GraphSettings3D;
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

function surfaceToTikz(expr: PreparedExpression3D, viewport: Viewport3D): string[] {
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
  const sampleDensity = 15;

  if (symbolic.ok && symbolic.expression) {
    const dash = expr.dashed ? ', dashed' : '';
    return [
      `% Surface: z = ${expr.rawInput}`,
      `\\addplot3[surf, shader=faceted interp, fill opacity=0.58, draw opacity=0.82, draw=${tikzColor(
        expr.color
      )}, fill=${tikzColor(expr.color)}, line width=${(expr.lineWidth * 0.5).toFixed(2)}pt${dash}, domain=${formatNumber(
        xMin
      )}:${formatNumber(xMax)}, y domain=${formatNumber(yMin)}:${formatNumber(
        yMax
      )}, samples=${sampleDensity}, samples y=${sampleDensity}]`,
      `{${symbolic.expression}};`
    ];
  }

  const cols = sampleDensity;
  const rows = cols;
  const dx = (xMax - xMin) / cols;
  const dy = (yMax - yMin) / rows;

  const dataLines: string[] = [];

  for (let yi = 0; yi <= rows; yi += 1) {
    const y = yMin + yi * dy;

    for (let xi = 0; xi <= cols; xi += 1) {
      const x = xMin + xi * dx;
      const z = expr.evaluator(x, y);

      const zText =
        z === null || !Number.isFinite(z) || Math.abs(z) > 1e7 || z < viewport.zMin || z > viewport.zMax
          ? 'nan'
          : formatNumber(z);

      dataLines.push(`${formatNumber(x)} ${formatNumber(y)} ${zText}`);
    }

    dataLines.push('');
  }

  const dash = expr.dashed ? ', dashed' : '';

  return [
    `% Surface: z = ${expr.rawInput} (sampled fallback: ${symbolic.reason ?? 'conversion unavailable'})`,
    `\\addplot3[surf, shader=faceted interp, fill opacity=0.55, draw opacity=0.8, draw=${tikzColor(
      expr.color
    )}, fill=${tikzColor(expr.color)}, line width=${(expr.lineWidth * 0.45).toFixed(2)}pt${dash}, mesh/rows=${
      rows + 1
    }, mesh/cols=${cols + 1}, unbounded coords=jump]`,
    'table[row sep=\\] {',
    ...dataLines.map((line) => `  ${line}\\`),
    '};'
  ];
}

export function generateTikzExport3D({ expressions, viewport, settings }: TikzExport3DInput): string {
  const azimuth = ((viewport.yaw * 180) / Math.PI + 360) % 360;
  const elevation = Math.max(-85, Math.min(85, (viewport.pitch * 180) / Math.PI));

  const axisLines = settings.showAxes ? 'middle' : 'none';
  const grid = settings.showGrid ? 'both' : 'none';
  const boxStyle = settings.showBox ? ', axis line style={draw opacity=0.5}' : '';

  const header = [
    '% GraphToTeX 3D export (pgfplots)',
    '% Required packages: \\usepackage{pgfplots} and \\pgfplotsset{compat=1.18}',
    '% Tip: rotate with view={azimuth}{elevation}',
    '\\begin{center}',
    '\\resizebox{0.88\\linewidth}{!}{%',
    '\\begin{tikzpicture}',
    `\\begin{axis}[view={${formatNumber(azimuth)}}{${formatNumber(elevation)}}, grid=${grid}, axis lines=${axisLines}${boxStyle}, z buffer=sort,`,
    `  xmin=${formatNumber(viewport.xMin)}, xmax=${formatNumber(viewport.xMax)},`,
    `  ymin=${formatNumber(viewport.yMin)}, ymax=${formatNumber(viewport.yMax)},`,
    `  zmin=${formatNumber(viewport.zMin)}, zmax=${formatNumber(viewport.zMax)},`,
    '  width=0.92\\linewidth, height=0.62\\linewidth, scale only axis,',
    '  colormap/viridis]'
  ];

  const body: string[] = [];

  expressions.forEach((expr) => {
    body.push(...surfaceToTikz(expr, viewport));
  });

  if (body.length === 0) {
    body.push('% No visible valid surfaces to export.');
  }

  const footer = ['\\end{axis}', '\\end{tikzpicture}', '}', '\\end{center}'];

  return [...header, ...body, ...footer].join('\n');
}

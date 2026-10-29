import { OPS, Util } from 'pdfjs-dist';
import type { PDFOperatorList } from 'pdfjs-dist/types/src/display/api';

export type PdfRule = { x: number; y: number; width: number; thickness: number };
type Point = [number, number];
type Segment = { a: Point; b: Point; thickness: number; rectangle: boolean };

// Read painted horizontal bars only. Clipping paths, images and glyph outlines
// must never become fractions. Coordinates match getTextContent + viewport.
export function extractPdfRules(operators: PDFOperatorList, viewport: number[]): PdfRule[] {
  let matrix = viewport.slice();
  let lineWidth = 1;
  const stack: { matrix: number[]; lineWidth: number }[] = [];
  let paths: Segment[] = [];
  const rules: PdfRule[] = [];
  const point = (x: number, y: number): Point => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
  function paint(stroke: boolean) {
    for (const path of paths) {
      if (!stroke && !path.rectangle) continue;
      const width = Math.abs(path.b[0] - path.a[0]);
      if (width >= 2 && Math.abs(path.a[1] - path.b[1]) <= 0.3 && path.thickness <= 2) {
        rules.push({ x: Math.min(path.a[0], path.b[0]), y: (path.a[1] + path.b[1]) / 2, width, thickness: Math.max(0.1, path.thickness) });
        if (rules.length >= 10000) break;
      }
    }
    paths = [];
  }
  for (let i = 0; i < operators.fnArray.length && rules.length < 10000; i++) {
    const op = operators.fnArray[i];
    const args = operators.argsArray[i];
    if (op === OPS.save || op === OPS.paintFormXObjectBegin) {
      stack.push({ matrix: matrix.slice(), lineWidth });
      if (op === OPS.paintFormXObjectBegin && args[0]) matrix = Util.transform(matrix, args[0]);
    } else if (op === OPS.restore || op === OPS.paintFormXObjectEnd) {
      const saved = stack.pop();
      if (saved) { matrix = saved.matrix; lineWidth = saved.lineWidth; }
    } else if (op === OPS.transform) matrix = Util.transform(matrix, args);
    else if (op === OPS.setLineWidth) lineWidth = Math.abs(args[0]);
    else if (op === OPS.constructPath) {
      const [ops, coords] = args as [number[], number[]];
      let index = 0;
      let current: Point | undefined;
      for (const part of ops) {
        if (part === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(index, index + 4); index += 4;
          paths.push({ a: point(x, y + h / 2), b: point(x + w, y + h / 2), thickness: Math.abs(h) * Math.hypot(matrix[2], matrix[3]), rectangle: true });
          current = undefined;
        } else if (part === OPS.moveTo || part === OPS.lineTo) {
          const next = point(coords[index++], coords[index++]);
          if (part === OPS.lineTo && current) paths.push({ a: current, b: next, thickness: lineWidth * Math.hypot(matrix[2], matrix[3]), rectangle: false });
          current = next;
        } else {
          index += part === OPS.curveTo ? 6 : part === OPS.curveTo2 || part === OPS.curveTo3 ? 4 : 0;
          current = undefined;
        }
      }
    } else if (op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke) paint(true);
    else if (op === OPS.fill || op === OPS.eoFill) paint(false);
    else if (op === OPS.endPath) paths = [];
  }
  return rules;
}

export type PdfTexMode = 'auto' | 'editable' | 'visual';
export interface PdfTexOptions { mode: PdfTexMode; pages: string; password: string }
export interface PdfTexPage { number: number; tex: string; characters: number; preserved: boolean; warnings: string[] }
export interface PdfTexResult {
  tex: string;
  archive: Uint8Array<ArrayBuffer>;
  pages: PdfTexPage[];
  elapsedMs: number;
  sourceName: string;
  format?: string;
  blocks?: number;
  equations?: number;
}
export type PdfTexResponse = { type: 'progress'; message: string; completed: number; total: number }
  | { type: 'result'; result: PdfTexResult } | { type: 'error'; message: string; passwordRequired?: boolean };

/** Validate once, deduplicate, and emit document order rather than expanding huge ranges. */
export function parsePageSelection(value: string, count: number): number[] {
  if (!value.trim()) return Array.from({ length: count }, (_, i) => i + 1);
  const selected = new Set<number>();
  for (const part of value.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers or ranges, such as 1-3, 5, 8-10.');
    const start = Number(match[1]); const end = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > count) {
      throw new Error(`Choose pages between 1 and ${count}, with each range in ascending order.`);
    }
    for (let page = start; page <= end; page++) selected.add(page);
  }
  return [...selected].sort((a, b) => a - b);
}

export function createTexDocument(pages: PdfTexPage[]): string {
  return `% Reconstructed by GraphToTeX. PDF does not retain the original LaTeX source.
% Compile with LuaLaTeX. Download the ZIP project if any pages are preserved.
\\documentclass[11pt]{article}
\\usepackage{fontspec}
\\usepackage{amsmath,amssymb}
\\usepackage[margin=1in]{geometry}
\\usepackage{pdfpages,graphicx}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.5em}
\\begin{document}
${pages.map(page => page.tex).join('')}\\end{document}
`;
}

export function pdfTexBaseName(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^\.+/, '').slice(0, 100) || 'document';
}

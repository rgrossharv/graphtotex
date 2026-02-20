import katex from 'katex';

export function renderMathPreview(latex: string | null, fallback: string): string {
  if (!latex) {
    return fallback ? `<span>${escapeHtml(fallback)}</span>` : '<span class="muted">Type an expression...</span>';
  }

  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      strict: 'ignore'
    });
  } catch {
    return `<span>${escapeHtml(fallback)}</span>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000 || (abs > 0 && abs < 0.001)) {
    return value.toExponential(2);
  }
  return Number(value.toFixed(4)).toString();
}

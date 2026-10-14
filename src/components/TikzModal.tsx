import { useEffect, useRef, useState } from 'react';

interface TikzModalProps {
  isOpen: boolean;
  tikzCode: string;
  variant?: '2d' | '3d' | 'diagram' | 'diagram-cd';
  scale?: number;
  onScaleChange?: (scale: number) => void;
  onClose: () => void;
}

export default function TikzModal({ isOpen, tikzCode, variant = '2d', scale, onScaleChange, onClose }: TikzModalProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [completeDocument, setCompleteDocument] = useState(false);
  const exportedCode = completeDocument ? [
    '\\documentclass{article}',
    ...(variant === '3d' ? ['\\usepackage{pgfplots}', '\\pgfplotsset{compat=1.18}'] : variant === 'diagram-cd' ? ['\\usepackage{tikz-cd}'] : ['\\usepackage{tikz}', '\\usetikzlibrary{arrows.meta}']),
    ...(variant === 'diagram' || variant === 'diagram-cd' ? ['\\usepackage{amsmath,amssymb}'] : []),
    '\\pagestyle{empty}', '\\begin{document}', tikzCode, '\\end{document}'
  ].join('\n') : tikzCode;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>('button, input, textarea');
        const first = items?.[0];
        const last = items?.[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen]);

  useEffect(() => { setCopied(false); setCopyError(false); }, [exportedCode, isOpen]);

  if (!isOpen) {
    return null;
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportedCode);
      setCopied(true);
    } catch {
      setCopyError(true);
    }
  };

  const onDownload = () => {
    const blob = new Blob([exportedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `graphtotex-export-${variant}.tex`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby="tikz-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2 id="tikz-modal-title">{variant === 'diagram-cd' ? 'Diagram TikZ-CD Export' : variant === 'diagram' ? 'Diagram TikZ Export' : 'TikZ Export'}</h2>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close export">
            ✕
          </button>
        </div>
        <p className="modal-note">
          {variant === '3d' ? (
            <>
              Requires <code>pgfplots</code>. Surface colors, density, and bounds are preserved. PGFPlots uses
              an orthographic view, so perspective differs from the browser preview.
            </>
          ) : variant === 'diagram-cd' ? (
            <>Requires <code>\usepackage{'{'}tikz-cd{'}'}</code> and <code>\usepackage{'{'}amsmath,amssymb{'}'}</code>. Exports native matrix cells and labeled arrows.</>
          ) : variant === 'diagram' ? (
            <>Requires <code>\usepackage{'{'}tikz{'}'}</code> and <code>\usetikzlibrary{'{'}arrows.meta{'}'}</code>. Labels use LaTeX math mode.</>
          ) : (
            <>
              Requires <code>tikz</code>. Trig expressions are exported as sampled coordinates for radian consistency.
            </>
          )}
        </p>
        {onScaleChange && <label className="export-scale">Export scale
          <input aria-label="Export scale" type="number" min="0.1" max="10" step="0.1" value={scale}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 0.1 && value <= 10) onScaleChange(value);
            }} />
        </label>}
        <label className="export-document-toggle"><input type="checkbox" checked={completeDocument} onChange={(event) => setCompleteDocument(event.target.checked)} />Complete LaTeX document with required packages</label>
        <textarea aria-label="TikZ source code" readOnly value={exportedCode} rows={20} className="tikz-textarea" />
        {copyError && <p role="status" className="expr-error">Clipboard access failed. Select the code above to copy it manually.</p>}
        <div className="modal-actions">
          <button onClick={onCopy}>{copied ? 'Copied!' : 'Copy to Clipboard'}</button>
          <button onClick={onDownload}>Download .tex</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

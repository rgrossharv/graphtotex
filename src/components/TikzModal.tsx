import { useEffect, useRef, useState } from 'react';
import TikzPreview, { type TikzVariant } from './TikzPreview';
import './TikzModal.css';

export type ExportAspectRatio = number | 'equal' | 'screen';

interface TikzModalProps {
  isOpen: boolean;
  tikzCode: string;
  variant?: TikzVariant;
  scale?: number;
  onScaleChange?: (scale: number) => void;
  aspectRatio?: ExportAspectRatio;
  screenAspectRatio?: number;
  onAspectRatioChange?: (aspectRatio: ExportAspectRatio) => void;
  onClose: () => void;
}

export default function TikzModal({ isOpen, tikzCode, variant = '2d', scale, onScaleChange, aspectRatio, screenAspectRatio, onAspectRatioChange, onClose }: TikzModalProps) {
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
        const items = dialogRef.current?.querySelectorAll<HTMLElement>('button, input, select, textarea');
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
      <div ref={dialogRef} tabIndex={-1} className="modal tikz-export-modal" role="dialog" aria-modal="true" aria-labelledby="tikz-modal-title" onClick={(event) => event.stopPropagation()}>
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
        <div className="export-options">
          {onScaleChange && <label className="export-scale">Export scale
            <input aria-label="Export scale" type="number" min="0.1" max="10" step="0.1" value={scale}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 0.1 && value <= 10) onScaleChange(value);
              }} />
          </label>}
          {onAspectRatioChange && (variant === '2d' || variant === '3d') && <label className="export-aspect-ratio">Aspect ratio{variant === '2d' ? ' (width:height)' : ''}
            <select value={aspectRatio ?? 1} onChange={(event) => {
              const value = event.target.value;
              onAspectRatioChange(value === 'equal' || value === 'screen' ? value : Number(value));
            }}>
              {variant === '3d' && <option value="equal">1:1:1 (Equal axes)</option>}
              <option value={1}>1:1 (Square)</option>
              <option value={4 / 3}>4:3</option>
              <option value={3 / 2}>3:2</option>
              <option value={16 / 9}>16:9 (Widescreen)</option>
              <option value={3 / 4}>3:4 (Portrait)</option>
              <option value={2 / 3}>2:3 (Portrait)</option>
              {screenAspectRatio && <option value="screen">Screen ({screenAspectRatio.toFixed(2)}:1)</option>}
            </select>
          </label>}
          {onAspectRatioChange && screenAspectRatio && <button type="button" className="export-match-screen"
            title="Use the graph's aspect ratio when Export was clicked" onClick={() => onAspectRatioChange('screen')}>Match screen</button>}
        </div>
        <label className="export-document-toggle"><input type="checkbox" checked={completeDocument} onChange={(event) => setCompleteDocument(event.target.checked)} />Complete LaTeX document with required packages</label>
        <div className="export-content">
          <TikzPreview code={tikzCode} variant={variant} />
          <section className="export-source" aria-labelledby="export-source-title">
            <div className="export-pane-heading"><h3 id="export-source-title">{completeDocument ? 'LaTeX document' : 'TikZ source'}</h3><span>.tex</span></div>
            <textarea aria-label="TikZ source code" readOnly value={exportedCode} rows={20} className="tikz-textarea" />
          </section>
        </div>
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

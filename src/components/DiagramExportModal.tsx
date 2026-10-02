import { useEffect, useMemo, useRef, useState } from 'react';
import { generateDiagramTikz, downloadText } from '../lib/diagramExport';
import type { Diagram } from '../lib/diagram';

export default function DiagramExportModal({ diagram, onClose }: { diagram: Diagram; onClose: () => void }) {
  const [standalone, setStandalone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const code = useMemo(() => generateDiagramTikz(diagram, standalone), [diagram, standalone]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const elements = dialog.current?.querySelectorAll<HTMLElement>('button, input, textarea');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => { document.removeEventListener('keydown', onKeyDown, true); previous?.focus(); };
  }, [onClose]);
  useEffect(() => { setCopied(false); setError(''); }, [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      textarea.current?.focus(); textarea.current?.select();
      setError('Code selected. Press Ctrl+C or ⌘C to copy.');
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={dialog} className="modal diagram-export-modal" role="dialog" aria-modal="true" aria-labelledby="diagram-export-title"
        onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h2 id="diagram-export-title">Export your diagram</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close export">✕</button>
        </div>
        <p className="modal-note">Readable TikZ with named objects and one command per arrow. No watermark.</p>
        <label className="diagram-check"><input type="checkbox" checked={standalone} onChange={(event) => setStandalone(event.target.checked)} />
          Complete LaTeX document</label>
        {!standalone && <p className="diagram-preamble">Add to your preamble: <code>{'\\usepackage{tikz}'}</code> and <code>{'\\usetikzlibrary{arrows.meta}'}</code>.
          For labels such as <code>{'\\mathbb{R}'}</code>, also use <code>{'\\usepackage{amsmath,amssymb}'}</code>.</p>}
        <textarea ref={textarea} readOnly value={code} rows={18} className="tikz-textarea" aria-label="Diagram TikZ code" spellCheck={false} />
        <div className="modal-actions">
          <button className="diagram-primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy TikZ'}</button>
          <button onClick={() => downloadText(code, 'commutative-diagram.tex')}>Download .tex</button>
          <button onClick={onClose}>Close</button>
          <span className="diagram-copy-status" role="status">{error}</span>
        </div>
      </div>
    </div>
  );
}

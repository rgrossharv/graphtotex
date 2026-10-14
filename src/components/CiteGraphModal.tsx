import { useEffect, useRef, useState } from 'react';
import { graphToTexBibtex, graphToTexStandardLatex } from '../lib/graphToTexCitation';

interface Props { isOpen: boolean; onClose: () => void }

export default function CiteGraphModal({ isOpen, onClose }: Props) {
  const [format, setFormat] = useState<'tex' | 'bib'>('tex');
  const [message, setMessage] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const code = format === 'tex' ? graphToTexStandardLatex() : graphToTexBibtex();
  useEffect(() => { setMessage(''); }, [format, isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>('button, textarea');
        const first = items?.[0], last = items?.[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [isOpen]);
  if (!isOpen) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setMessage('Copied to clipboard.'); }
    catch { setMessage('Select the code below to copy it manually.'); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `graphtotex-citation.${format}`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <div className="modal-backdrop" onClick={onClose}>
    <div ref={ref} tabIndex={-1} className="modal cite-graph-modal" role="dialog" aria-modal="true" aria-labelledby="cite-graph-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2 id="cite-graph-title">Cite GraphToTeX</h2><button className="icon-btn" aria-label="Close citation popup" onClick={onClose}>✕</button></div>
      <p className="modal-note">Choose the format that fits your document.</p>
      <div className="cite-format-buttons" role="group" aria-label="GraphToTeX citation format"><button aria-pressed={format === 'tex'} onClick={() => setFormat('tex')}>Standard LaTeX <span>No extra packages</span></button><button aria-pressed={format === 'bib'} onClick={() => setFormat('bib')}>BibTeX <span>For your .bib file</span></button></div>
      <p className="cite-format-instructions">{format === 'tex' ? <>Paste this bibliography near the end of your document. Cite it with <code>\cite{'{'}gross_graphtotex{'}'}</code>.</> : <>Add this entry to your bibliography file. Standard BibTeX works with <code>\bibliographystyle{'{'}plain{'}'}</code> and <code>\bibliography{'{'}references{'}'}</code>; cite it with <code>\cite{'{'}gross_graphtotex{'}'}</code>.</>}</p>
      <textarea className="tikz-textarea" aria-label="GraphToTeX citation code" readOnly rows={12} value={code} />
      <div className="modal-actions"><button onClick={() => void copy()}>Copy citation</button><button onClick={download}>Download .{format}</button><button onClick={onClose}>Close</button></div>
      <p className="cite-copy-status" role="status">{message}</p>
    </div>
  </div>;
}

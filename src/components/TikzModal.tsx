interface TikzModalProps {
  isOpen: boolean;
  tikzCode: string;
  variant?: '2d' | '3d';
  onClose: () => void;
}

export default function TikzModal({ isOpen, tikzCode, variant = '2d', onClose }: TikzModalProps) {
  if (!isOpen) {
    return null;
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(tikzCode);
    } catch {
      window.alert('Clipboard access failed. Please copy manually.');
    }
  };

  const onDownload = () => {
    const blob = new Blob([tikzCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = variant === '3d' ? 'graphtotex-export-3d.tex' : 'graphtotex-export-2d.tex';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>TikZ Export</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <p className="modal-note">
          {variant === '3d' ? (
            <>
              Requires <code>pgfplots</code> (<code>\usepackage{'{'}pgfplots{'}'}</code>). Exported surfaces use
              translucent patches.
            </>
          ) : (
            <>
              Requires <code>tikz</code>. Trig expressions are exported as sampled coordinates for radian consistency.
            </>
          )}
        </p>
        <textarea readOnly value={tikzCode} rows={20} className="tikz-textarea" />
        <div className="modal-actions">
          <button onClick={onCopy}>Copy to Clipboard</button>
          <button onClick={onDownload}>Download .tex</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

export default function PdfDocumentPreview({ data }: { data: Uint8Array<ArrayBuffer> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setDocument(null); setPage(1); setError('');
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const loading = pdfjs.getDocument({ data: data.slice(), isEvalSupported: false });
        cleanup = () => { void loading.destroy(); };
        const loaded = await loading.promise;
        if (!cancelled) setDocument(loaded);
      } catch { if (!cancelled) setError('The PDF preview could not load. Download the PDF to view it.'); }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [data]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    void (async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (cancelled || !canvasRef.current) return;
        const size = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: Math.min(2, 1600 / size.width) });
        const canvas = canvasRef.current;
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        render = pdfPage.render({ canvasContext: context, viewport });
        await render.promise;
      } catch { if (!cancelled) setError('The PDF preview could not load. Download the PDF to view it.'); }
    })();
    return () => { cancelled = true; render?.cancel(); };
  }, [document, page]);

  return <div className="pdf-page-preview">
    <div className="pdf-page-controls"><button aria-label="Previous PDF page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>←</button><span role="status">{document ? `Page ${page} of ${document.numPages}` : 'Loading PDF preview…'}</span><button aria-label="Next PDF page" disabled={!document || page >= document.numPages} onClick={() => setPage((value) => value + 1)}>→</button></div>
    {error ? <p className="misc-error">{error}</p> : <div className="pdf-page-scroll"><canvas ref={canvasRef} aria-label={`PDF page ${page}`} /></div>}
  </div>;
}

import { useCallback, useEffect, useRef, useState } from 'react';

export type TikzVariant = '2d' | '3d' | 'diagram' | 'diagram-cd';

export default function TikzPreview({ code, variant }: { code: string; variant: TikzVariant }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const requestRef = useRef(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  const render = useCallback(() => {
    requestRef.current += 1;
    setStatus('loading');
    frameRef.current?.contentWindow?.postMessage({
      type: 'graphtotex-render', id: requestRef.current, code, variant
    }, window.location.origin);
  }, [code, variant]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== 'graphtotex-preview' || event.data.id !== requestRef.current) return;
      if (event.data.status === 'ready' || event.data.status === 'error') setStatus(event.data.status);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    render();
  }, [render, attempt]);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = window.setTimeout(() => setStatus('error'), 60000);
    return () => window.clearTimeout(timer);
  }, [status, code, variant, attempt]);

  return (
    <section className="export-preview" aria-labelledby="export-preview-title">
      <div className="export-pane-heading">
        <h3 id="export-preview-title">LaTeX preview</h3>
        <span role="status" aria-live="polite">{status === 'ready' ? 'Rendered' : status === 'loading' ? 'Rendering…' : 'Preview unavailable'}</span>
      </div>
      <div className="export-preview-paper" aria-busy={status === 'loading'}>
        <iframe ref={frameRef} src="/tikz-preview.html" title="Compiled LaTeX figure"
          className={status === 'ready' ? 'is-ready' : ''} onLoad={render} />
        {status === 'loading' && <div className="export-preview-message"><span className="export-preview-spinner" aria-hidden="true" /><p>Typesetting your figure…</p><small>The first preview may take a moment.</small></div>}
        {status === 'error' && <div className="export-preview-message"><p>This figure could not be previewed.</p><small>Check your connection or try compiling the .tex file in your LaTeX editor.</small><button onClick={() => setAttempt((value) => value + 1)}>Retry preview</button></div>}
      </div>
      <p className="export-preview-note">Figure fitted to preview. Final page layout depends on your LaTeX document.</p>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { compileTex, TexCompileError, type TexAsset } from '../lib/texCompiler';
import { createSlideHtml, pdfToSlides } from '../lib/texHtml';
import PdfDocumentPreview from './PdfDocumentPreview';

const ARTICLE = String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}
\title{A little mathematics}
\author{GraphToTeX}
\date{}
\begin{document}
\maketitle
\section{Calculus}
The fundamental theorem of calculus connects derivatives and integrals:
\[
  \int_a^b f'(x)\,dx = f(b)-f(a).
\]
\section{Linear algebra}
\[
  A = \begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix},
  \qquad \det(A)=-2.
\]
\end{document}`;
const BEAMER = String.raw`\documentclass[aspectratio=169]{beamer}
\usetheme{Madrid}
\usepackage{amsmath,amssymb}
\title{A little mathematics}
\author{GraphToTeX}
\date{}
\begin{document}
\begin{frame}
  \titlepage
\end{frame}
\begin{frame}{From derivatives to integrals}
  \begin{itemize}
    \item Derivatives describe change.
    \item Integrals describe accumulation.
  \end{itemize}
  \[
    \int_a^b f'(x)\,dx = f(b)-f(a)
  \]
\end{frame}
\begin{frame}{A matrix example}
  \[
    A=\begin{bmatrix}1&2\\3&4\end{bmatrix},\qquad\det(A)=-2
  \]
\end{frame}
\end{document}`;

export default function TexTools({ kind }: { kind: 'pdf' | 'html' }) {
  const [source, setSource] = useState(kind === 'html' ? BEAMER : ARTICLE);
  const [assets, setAssets] = useState<TexAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [html, setHtml] = useState('');
  const [slideCount, setSlideCount] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const pdfRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => { controllerRef.current?.abort(); setBusy(false); setStatus(''); }, [kind]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  useEffect(() => {
    controllerRef.current?.abort();
    setBusy(false); setStatus(''); setError(''); setPdfUrl(''); setHtml(''); setLog(''); pdfRef.current = null;
  }, [source, assets]);

  const convert = async () => {
    if (!/\\documentclass(?:\[[^\]]*\])?\s*\{/.test(source)) { setError('Paste a complete LaTeX document, including \\documentclass and \\begin{document}.'); return; }
    if (source.length > 500000) { setError('Use a TeX document smaller than 500 KB.'); return; }
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true); setError(''); setLog(''); setHtml(''); setPdfUrl('');
    try {
      const output = await compileTex(source, assets, controller.signal, setStatus);
      if (controller.signal.aborted) return;
      setLog(output.log); pdfRef.current = output.pdf;
      setPdfUrl(URL.createObjectURL(new Blob([output.pdf], { type: 'application/pdf' })));
      if (kind === 'html') {
        const slides = await pdfToSlides(output.pdf, setStatus, controller.signal);
        if (controller.signal.aborted) return;
        const title = source.match(/\\title(?:\[[^\]]*\])?\s*\{([^}]*)\}/)?.[1] || 'GraphToTeX presentation';
        setHtml(createSlideHtml(slides, title)); setSlideCount(slides.length);
      }
      setStatus(kind === 'html' ? 'HTML slides ready.' : 'PDF ready.');
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'Conversion could not be completed.');
      if (failure instanceof TexCompileError) setLog(failure.log);
      setStatus('');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const download = (content: BlobPart, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="tex-tools-layout">
    <section className="tex-source-panel" aria-label="TeX document source">
      <div className="misc-panel-heading"><h2>{kind === 'pdf' ? 'TeX to PDF' : 'TeX to HTML'}</h2><p>{kind === 'pdf' ? 'Compile a complete LaTeX document in your browser.' : 'Turn LaTeX and Beamer into a standalone HTML slide deck.'}</p></div>
      <div className="tex-source-content">
        <div className="tex-template-actions"><button onClick={() => setSource(ARTICLE)}>Article example</button><button onClick={() => setSource(BEAMER)}>Beamer example</button><label className="misc-file-button">Open .tex<input aria-label="Open TeX file" type="file" accept=".tex,text/plain" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setSource(await file.text()); event.target.value = ''; }} /></label></div>
        <label className="misc-field">LaTeX source<textarea aria-label="LaTeX document source" rows={20} value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void convert(); } }} /></label>
        <label className="misc-field">Supporting files (images, .tex, .sty, .bib)<input aria-label="Supporting TeX files" type="file" multiple onChange={async (event) => { const files = Array.from(event.target.files || []); if (files.reduce((total, file) => total + file.size, 0) > 25000000) { setError('Keep supporting files under 25 MB in total.'); return; } const loaded = await Promise.all(files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }))); setAssets(loaded); }} /></label>
        {!!assets.length && <p className="misc-hint">{assets.map((asset) => asset.name).join(', ')} <button onClick={() => setAssets([])}>Remove files</button></p>}
        <p className="misc-hint">Uses pdfLaTeX. Standard packages download as needed. Add any local files your document references. XeLaTeX-only packages such as fontspec need a different compiler.</p>
        {kind === 'html' && <p className="misc-hint">HTML export preserves each compiled page as an image, with page text for accessibility. Beamer overlays become separate slides. Downloaded decks work offline and include arrow-key navigation, an all-pages view, and print styles.</p>}
      </div>
      <div className="misc-input-footer"><button className="misc-primary-button" onClick={() => void convert()} disabled={busy || !source.trim()}>{busy ? 'Converting…' : kind === 'html' ? 'Convert to HTML' : 'Compile PDF'}</button>{busy && <button onClick={() => { controllerRef.current?.abort(); setBusy(false); setStatus('Conversion cancelled.'); }}>Cancel</button>}</div>
    </section>
    <section className="tex-preview-panel" aria-label="Converted document">
      <div className="misc-panel-heading"><h2>{kind === 'html' ? 'HTML slide preview' : 'PDF preview'}</h2><p role="status">{status || 'Your converted document will appear here.'}</p></div>
      <div className="tex-conversion-actions">
        <button disabled={!pdfUrl || busy} onClick={() => { if (pdfRef.current) download(pdfRef.current, 'graphtotex-document.pdf', 'application/pdf'); }}>Download PDF</button>
        {kind === 'html' && <button disabled={!html || busy} onClick={() => download(html, 'graphtotex-slides.html', 'text/html;charset=utf-8')}>Download HTML{html ? ` · ${slideCount} slides` : ''}</button>}
        <button onClick={() => download(source, 'graphtotex-document.tex', 'text/plain;charset=utf-8')}>Download source</button>
      </div>
      {error && <p role="alert" className="misc-error tex-conversion-error">{error}</p>}
      {kind === 'html' && html ? <iframe className="tex-document-preview" title="HTML slides" srcDoc={html} sandbox="allow-scripts" allow="fullscreen" /> : kind === 'pdf' && pdfUrl && pdfRef.current ? <PdfDocumentPreview data={pdfRef.current} /> : <div className="misc-empty-result"><span aria-hidden="true">{kind === 'html' ? 'TeX → HTML' : 'TeX → PDF'}</span><p>{busy ? 'Compiling your document. The first run may need to download packages.' : 'Paste a document, open a .tex file, or try an example.'}</p></div>}
      {!!log && <details className="tex-compilation-log"><summary>Compilation log</summary><pre>{log}</pre></details>}
    </section>
  </div>;
}

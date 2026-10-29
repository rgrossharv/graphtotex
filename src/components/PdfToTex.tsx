import { useEffect, useRef, useState } from 'react';
import { pdfTexBaseName, type PdfTexMode, type PdfTexResponse, type PdfTexResult } from '../lib/pdfToTex';
import './PdfToTex.css';

const download = (data: BlobPart, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
interface Download { name: string; label: string; bytes: number }

export default function PdfToTex() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<PdfTexMode>('auto');
  const [pages, setPages] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Drop a document to begin. Files stay on your device.');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState('');
  const [result, setResult] = useState<PdfTexResult | null>(null);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [downloadError, setDownloadError] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const runRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => () => { workerRef.current?.terminate(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}downloads/pdf-to-tex.json`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const manifest = await response.json() as { files: Download[] }; setDownloads(manifest.files);
    }).catch(() => { if (!controller.signal.aborted) setDownloadError('CLI downloads have not been built for this checkout. Run npm run build:cli.'); });
    return () => controller.abort();
  }, []);

  const cancel = () => { runRef.current++; workerRef.current?.terminate(); workerRef.current = null; setBusy(false); setStatus('Conversion cancelled.'); };
  const reset = () => { cancel(); setStatus('Ready to convert.'); setResult(null); setError(''); setCopyStatus(''); setProgress({ completed: 0, total: 0 }); };
  const convert = (selected: File, selectedPassword = password) => {
    reset();
    const run = runRef.current;
    setBusy(true); setStatus('Starting conversion…');
    const worker = new Worker(new URL('../lib/pdfToTex.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<PdfTexResponse>) => {
      if (run !== runRef.current) return;
      const message = event.data;
      if (message.type === 'progress') { setStatus(message.message); setProgress(message); }
      else {
        worker.terminate(); workerRef.current = null; setBusy(false);
        if (message.type === 'error') { setError(message.message); setNeedsPassword(!!message.passwordRequired); setStatus('Conversion needs attention.'); }
        else { setResult(message.result); setPassword(''); setNeedsPassword(false); setStatus(message.result.format ? `Converted ${message.result.format.toUpperCase()} · ${message.result.blocks} blocks in ${(message.result.elapsedMs / 1000).toFixed(2)} seconds.` : `Converted ${message.result.pages.length} pages in ${(message.result.elapsedMs / 1000).toFixed(2)} seconds.`); }
      }
    };
    worker.onerror = () => {
      if (run !== runRef.current) return;
      worker.terminate(); workerRef.current = null; setBusy(false); setError('The conversion worker stopped. Try a smaller page range or use the native CLI.'); setStatus('Conversion stopped.');
    };
    worker.postMessage({ file: selected, options: { mode, pages, password: selectedPassword } });
  };
  const choose = (files: File[]) => {
    if (files.length !== 1) { setError('Choose one document at a time.'); return; }
    const selected = files[0];
    if (selected.size > 250 * 1024 * 1024) { setError('Use a PDF up to 250 MB here, or download the CLI for larger files.'); return; }
    setFile(selected); setPassword(''); setNeedsPassword(false); convert(selected, '');
  };
  const isPdf=!file || /\.pdf$/i.test(file.name);
  const preserved = result?.pages.filter(page => page.preserved).length || 0;
  const warnings = result?.pages.flatMap(page => page.warnings.map(warning => `Page ${page.number}: ${warning}`)) || [];

  return <div className="tex-tools-layout pdf-tex-layout">
    <section className="tex-source-panel" aria-label="PDF to LaTeX converter">
      <div className="misc-panel-heading"><h2>Documents → TeX</h2><p>PDF, Word, EPUB, ODT, HTML, Markdown, and text · local conversion</p></div>
      <div className="tex-source-content">
        <div className={`pdf-tex-drop${dragging ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); choose(Array.from(event.dataTransfer.files)); }}>
          <span aria-hidden="true">PDF → TeX</span>
          <strong>Drop a document here</strong>
          <p>or choose a file to convert immediately</p>
          <button className="misc-primary-button" onClick={() => inputRef.current?.click()}>Choose document</button>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.epub,.odt,.html,.htm,.xhtml,.md,.markdown,.txt,.doc" aria-label="Choose PDF to convert to LaTeX" onChange={event => { if (event.target.files?.length) choose(Array.from(event.target.files)); event.target.value = ''; }} hidden />
        </div>
        {file && <p className="pdf-tex-filename">{file.name} <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></p>}
        {isPdf && <><label className="misc-field">Conversion mode<select value={mode} onChange={event => { reset(); setMode(event.target.value as PdfTexMode); }}>
          <option value="auto">Automatic · editable text, preserve complex pages</option>
          <option value="editable">Editable text · approximate reconstruction</option>
          <option value="visual">Preserve appearance · original PDF pages</option>
        </select></label>
        <p className="misc-hint">{mode === 'auto' ? 'Rebuilds simple text pages as LaTeX. Pages with figures, vector artwork, or no text are preserved from the PDF.' : mode === 'editable' ? 'Extracts selectable text, estimates headings and reading order, and escapes LaTeX safely. Images and drawings are omitted. Scanned pages need OCR.' : 'Fastest path: wraps selected PDF pages in a LaTeX document. Pages look like the original and are not editable source.'}</p>
        <label className="misc-field">Pages<input placeholder="All pages, or e.g. 1-3, 5" value={pages} onChange={event => { reset(); setPages(event.target.value); }} /></label></>}
        <p className="misc-hint">Word (.docx), EPUB, ODT, HTML, Markdown, and UTF-8 text convert directly to editable TeX, without a PDF step. In Google Docs, use File → Download → Microsoft Word (.docx), then drop that file here. Legacy .doc files must be saved as .docx first.</p>
        {needsPassword && <label className="misc-field">PDF password<input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label>}
        <p className="misc-hint">A PDF stores drawing instructions, not its original LaTeX. Equations, tables, columns, and font choices need review. Scans remain images unless you add OCR. Compile the result with LuaLaTeX; preserved pages need the ZIP project.</p>
        <details className="pdf-tex-cli"><summary>Use the native Rust CLI</summary>
          <p className="misc-hint">Convert locally from your terminal. No browser, server, or Python runtime required.</p>
          <pre>graphtotex-pdf input.pdf -o output --mode auto</pre>
          <div className="pdf-tex-downloads">{downloads.map(item => <a key={item.name} href={`${import.meta.env.BASE_URL}downloads/${item.name}`} download>{item.label} <span>({(item.bytes / 1024 / 1024).toFixed(1)} MB)</span></a>)}</div>
          {downloadError && <p className="misc-hint">{downloadError}</p>}
          <p className="misc-hint">Extract the archive, then run the binary in a terminal. Source and build instructions are included in the Rust source download. Available platform binaries reflect the latest site build.</p>
        </details>
      </div>
      <div className="misc-input-footer"><button className="misc-primary-button" disabled={!file || busy} onClick={() => file && convert(file)}>{busy ? 'Converting…' : isPdf ? 'Convert PDF' : 'Convert document'}</button>{busy && <button onClick={cancel}>Cancel</button>}</div>
    </section>
    <section className="tex-preview-panel" aria-label="Reconstructed LaTeX">
      <div className="misc-panel-heading"><h2>LaTeX output</h2><p role="status" aria-live="polite">{status}</p></div>
      <div className="tex-conversion-actions">
        <button disabled={!result || busy} onClick={() => result && download(result.archive, `${pdfTexBaseName(result.sourceName)}-latex.zip`, 'application/zip')}>Download ZIP project</button>
        <button disabled={!result || busy} onClick={() => result && download(result.tex, `${pdfTexBaseName(result.sourceName)}.tex`, 'text/plain;charset=utf-8')}>Download .tex</button>
        <button disabled={!result || busy} onClick={async () => { if (result) { try { await navigator.clipboard.writeText(result.tex); setCopyStatus('LaTeX copied.'); } catch { setCopyStatus('Copy failed. Download the .tex file instead.'); } } }}>Copy TeX</button>
        <span className="misc-hint" role="status">{copyStatus}</span>
      </div>
      {busy && <progress className="pdf-tex-progress" aria-label="PDF conversion progress" max={progress.total || 1} value={progress.total ? progress.completed : undefined} />}
      {error && <p role="alert" className="misc-error tex-conversion-error">{error}</p>}
      {result ? <>
        <div className="pdf-tex-stats">{result.format ? <><span>{result.format.toUpperCase()}</span><span>{result.blocks} blocks</span><span>{result.equations} equations</span></> : <><span>{result.pages.length} pages</span><span>{result.pages.length - preserved} editable</span><span>{preserved} preserved</span></>}<span>{(result.elapsedMs / 1000).toFixed(2)} s</span></div>
        {preserved > 0 && <p className="misc-hint pdf-tex-note">Download the ZIP project to include the preserved pages. The .tex file references assets in that ZIP.</p>}
        <textarea className="pdf-tex-output" aria-label="Reconstructed LaTeX source" value={result.tex.slice(0, 300000)} readOnly spellCheck={false} />
        {result.tex.length > 300000 && <p className="misc-hint pdf-tex-note">Preview shows the first 300,000 characters. Downloads contain the complete source.</p>}
        {!!warnings.length && <details className="tex-compilation-log"><summary>Conversion notes · {warnings.length}</summary><ul>{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
      </> : <div className="misc-empty-result"><span aria-hidden="true">PDF → TeX</span><p>Drop a PDF to recover its text and build a LaTeX project. Processing runs in a cancellable worker so the page stays responsive.</p></div>}
    </section>
  </div>;
}

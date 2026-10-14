import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { CSL, CSLType } from '@citation-js/core';
import {
  CITATION_STORAGE_KEY, CITATION_TYPES, authorText, bibliography, citationKey, citationPreview,
  dateValue, ensureCitationKeys, importCitationSources, latexBibliographyDocument, loadCitations,
  lookupDoi, mergeCitations, newCitation, normalizeDoi, parseAuthors, parseDate, plainBibliography,
  type BibliographyBackend, type CitationRecord, type TextCitationStyle
} from '../lib/citations';
import './CitationWorkspace.css';

type OutputTab = 'bib' | 'latex' | 'text';
interface ImportReport { added: number; duplicates: number; issues: string[] }

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}
function needsReview(record: CitationRecord) { return !!record.review || !record.data.title?.trim(); }

export default function CitationWorkspace() {
  const [records, setRecords] = useState<CitationRecord[]>(loadCitations);
  const recordsRef = useRef(records); recordsRef.current = records;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<'details' | 'export'>('details');
  const [importOpen, setImportOpen] = useState(true);
  const [paste, setPaste] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [backend, setBackend] = useState<BibliographyBackend>('bibtex');
  const [numeric, setNumeric] = useState(false);
  const [textStyle, setTextStyle] = useState<TextCitationStyle>('apa');
  const [tab, setTab] = useState<OutputTab>('bib');
  const [copied, setCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('Saved on this device');
  const [dragOver, setDragOver] = useState(false);
  const [authorDraft, setAuthorDraft] = useState('');
  const [editorDraft, setEditorDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const selected = records.find((record) => record.id === selectedId);
  const isBuiltIn = selected?.id === 'graphtotex';
  const normalized = useMemo(() => ensureCitationKeys(records), [records]);
  const exportKey = normalized.find((record) => record.id === selectedId)?.key || '';
  const reviewCount = records.filter(needsReview).length;
  const filtered = records.filter((record) => `${record.data.title || ''} ${record.key} ${authorText(record.data.author)} ${record.data.DOI || ''} ${record.data.URL || ''}`.toLowerCase().includes(search.toLowerCase()));
  const outputs = useMemo(() => {
    try {
      return { bib: bibliography(records, backend), latex: latexBibliographyDocument(records, backend, numeric), text: plainBibliography(records, textStyle), error: '' };
    } catch (error) {
      return { bib: '', latex: '', text: '', error: error instanceof Error ? error.message : 'Could not format this library.' };
    }
  }, [records, backend, numeric, textStyle]);
  const output = outputs[tab];

  useEffect(() => { setAuthorDraft(authorText(selected?.data.author)); }, [selectedId, selected?.data.author]);
  useEffect(() => { setEditorDraft(authorText(selected?.data.editor)); }, [selectedId, selected?.data.editor]);
  useEffect(() => { if (editorRef.current) editorRef.current.scrollTop = 0; }, [selectedId]);
  useEffect(() => { setPane('details'); }, [selectedId]);

  useEffect(() => {
    try { localStorage.setItem(CITATION_STORAGE_KEY, JSON.stringify(records)); setSaveMessage('Saved on this device'); }
    catch { setSaveMessage('Library is available in this session'); }
  }, [records]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => { setCopied(false); setCopyMessage(''); }, [output]);

  const patchRecord = (patch: Partial<CitationRecord>) => {
    if (!selected || isBuiltIn) return;
    setRecords((prev) => prev.map((record) => record.id === selected.id ? { ...record, ...patch } : record));
  };
  const patchData = (patch: Partial<CSL>) => {
    if (!selected || isBuiltIn) return;
    setRecords((prev) => prev.map((record) => record.id === selected.id ? { ...record, data: { ...record.data, ...patch } } : record));
  };
  const addManual = () => {
    const record = newCitation();
    const next = ensureCitationKeys([...recordsRef.current, record]);
    setRecords(next); setSelectedId(record.id); setSearch(''); setPane('details');
    requestAnimationFrame(() => titleInputRef.current?.focus());
  };
  const removeRecord = (id: string) => {
    if (id === 'graphtotex') return;
    setRecords((prev) => prev.filter((record) => record.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const appendImported = (incoming: CitationRecord[], issues: string[]) => {
    const merged = mergeCitations(recordsRef.current, incoming);
    const added = merged.records.length - recordsRef.current.length;
    setRecords(merged.records);
    if (added > 0) setImportOpen(false);
    setReport({ added, duplicates: merged.duplicates, issues });
    const first = merged.records.find((record) => !recordsRef.current.some((existing) => existing.id === record.id));
    if (first) { setSelectedId(first.id); setSearch(''); }
  };

  const importSources = async (files?: File[]) => {
    if (busy) return;
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true); setReport(null); setProgress(null);
    const incoming: CitationRecord[] = [], issues: string[] = [];
    try {
      const inputs = files ? await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() }))) : [{ name: 'Pasted sources', text: paste }];
      for (let i = 0; i < inputs.length && !controller.signal.aborted; i++) {
        const input = inputs[i];
        try {
          const result = await importCitationSources(input.text, controller.signal, (done, total) => setProgress({ done, total }));
          incoming.push(...result.records); issues.push(...result.issues.map((issue) => `${input.name}: ${issue}`));
        } catch (error) { issues.push(`${input.name}: ${error instanceof Error ? error.message : 'Import failed.'}`); }
      }
      appendImported(incoming, issues);
    } catch (error) { setReport({ added: 0, duplicates: 0, issues: [error instanceof Error ? error.message : 'Could not read these files.'] }); }
    finally { setBusy(false); setProgress(null); controllerRef.current = null; }
  };
  const dropFiles = (event: DragEvent) => {
    event.preventDefault(); setDragOver(false);
    if (event.dataTransfer.files.length) void importSources(Array.from(event.dataTransfer.files));
  };
  const retryDoi = async () => {
    if (!selected?.data.DOI || busy) return;
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true);
    try {
      const found = await lookupDoi(selected.data.DOI, controller.signal);
      setRecords((prev) => prev.map((record) => {
        if (record.id !== selected.id) return record;
        const filled = Object.fromEntries(Object.entries(record.data).filter(([, value]) => value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0)));
        return { ...record, review: found.review, data: { ...found.data, ...filled, id: record.id } };
      }));
    } catch (error) { setReport({ added: 0, duplicates: 0, issues: [controller.signal.aborted ? 'Lookup cancelled.' : error instanceof Error ? error.message : 'DOI lookup failed.'] }); }
    finally { setBusy(false); controllerRef.current = null; }
  };
  const copyOutput = async (text = output, isCitation = false) => {
    try { await navigator.clipboard.writeText(text); if (!isCitation) setCopied(true); setCopyMessage(isCitation ? 'Citation command copied.' : 'Copied to clipboard.'); }
    catch { setCopyMessage('Clipboard unavailable. Select and copy the text manually.'); }
  };

  return <main className="citation-workspace">
    <div className="citation-toolbar">
      <div><h2>Citation library</h2><p>Add sources, check their details, then export.</p></div>
      <span className="citation-save-status">● {saveMessage}</span>
      <button className="citation-primary" onClick={addManual}>+ Add manually</button>
    </div>

    <div className="citation-workspace-tabs" role="tablist" aria-label="Citation workspace view">
      <button role="tab" aria-selected={pane === 'details'} aria-controls="citation-details-panel" id="citation-details-tab" onClick={() => setPane('details')}>Review references</button>
      <button role="tab" aria-selected={pane === 'export'} aria-controls="citation-export-panel" id="citation-export-tab" onClick={() => setPane('export')}>Export</button>
    </div>

    <section className="citation-library" aria-label="Citation library">
      <details className="citation-import" open={importOpen} onToggle={(event) => setImportOpen(event.currentTarget.open)}>
        <summary>Import sources <span>DOIs, links, or files</span></summary><p className="citation-help">Paste DOIs or links below, or choose bibliography files.</p>
        <textarea aria-label="Sources to import" value={paste} onChange={(event) => setPaste(event.target.value)} rows={5} placeholder={'10.1038/nphys1170\nhttps://example.org/article\n\nOr paste BibTeX, RIS, or CSL JSON…'} />
        <div className="citation-import-actions"><button className="citation-primary" disabled={busy || !paste.trim()} onClick={() => void importSources()}>{busy ? 'Importing…' : 'Import sources'}</button>{busy && <button onClick={() => controllerRef.current?.abort()}>Cancel</button>}</div>
        <button className={`citation-dropzone ${dragOver ? 'is-over' : ''}`} disabled={busy} onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={dropFiles}>
          <span aria-hidden="true">↑</span><strong>Drop files or browse</strong><small>.bib, .ris, .json, .txt, .doi, .csv</small>
        </button>
        <input ref={fileInputRef} type="file" multiple accept=".bib,.ris,.json,.txt,.doi,.csv,.url" aria-label="Import citation files" hidden onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void importSources(files); }} />
        {progress && <div className="citation-progress" role="status"><progress max={progress.total} value={progress.done} /><span>{progress.done} of {progress.total} sources processed</span></div>}
      </details>
      {report && <div className="citation-import-report" role="status"><p>{report.added} added{report.duplicates ? ` · ${report.duplicates} duplicates skipped` : ''}</p>{report.issues.length > 0 && <details open><summary>{report.issues.length} import {report.issues.length === 1 ? 'note' : 'notes'}</summary><ul>{report.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></details>}</div>}
      <div className="citation-list-heading"><h3>Sources <span>{records.length}</span></h3><input aria-label="Search references" placeholder="Search sources…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="citation-source-list">
        {filtered.map((record) => <div key={record.id} className={`citation-source-row ${selectedId === record.id ? 'is-selected' : ''}`}>
          <button className="citation-source-select" onClick={() => setSelectedId(record.id)} aria-label={`Edit reference ${record.data.title || record.data.DOI || record.data.URL || 'Untitled reference'}`}>
            <span className="citation-source-title">{record.data.title || record.data.DOI || record.data.URL || 'Untitled reference'}</span>
            <span className="citation-source-byline">{authorText(record.data.author) || 'No author entered'}{dateValue(record.data.issued) ? ` · ${dateValue(record.data.issued)}` : ''}</span>
            <span className="citation-source-meta"><code>{normalized.find((r) => r.id === record.id)?.key}</code>{record.id === 'graphtotex' ? <span className="citation-included">Included</span> : needsReview(record) ? <span className="citation-review-badge">Review</span> : null}</span>
          </button>
          {record.id !== 'graphtotex' && <button className="citation-remove" aria-label={`Delete reference ${record.data.title || record.data.DOI || record.data.URL || 'Untitled reference'}`} onClick={() => removeRecord(record.id)}>×</button>}
        </div>)}
        {!filtered.length && <p className="citation-help">No matching references.</p>}
      </div>
    </section>

    <section className="citation-editor" aria-label="Reference details" id="citation-details-panel" aria-labelledby="citation-details-tab" hidden={pane !== 'details'}>
      <div className="citation-panel-heading"><span className="diagram-eyebrow">Reference details</span><h3>{selected ? isBuiltIn ? 'GraphToTeX' : 'Edit reference' : 'Build your bibliography'}</h3></div>
      <div ref={editorRef} className="citation-editor-scroll">
        {selected ? <>
          {isBuiltIn && <div className="citation-built-in-note">This software citation is included in every export.</div>}
          {selected.review && <div className="citation-review-note"><p>{selected.review}</p><button onClick={() => patchRecord({ review: undefined })} disabled={!selected.data.title?.trim()}>Mark reviewed</button></div>}
          <label className="citation-field">Reference type<select aria-label="Reference type" disabled={isBuiltIn} value={selected.data.type} onChange={(event) => patchData({ type: event.target.value as CSLType })}>{!CITATION_TYPES.some((t) => t.value === selected.data.type) && <option value={selected.data.type}>{selected.data.type}</option>}{CITATION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label className="citation-field">Title<input ref={titleInputRef} aria-label="Reference title" disabled={isBuiltIn} value={selected.data.title || ''} placeholder="Title of the article, book, or page" onChange={(event) => patchData({ title: event.target.value })} /></label>
          <label className="citation-field">Authors<textarea aria-label="Reference authors" disabled={isBuiltIn} rows={2} value={authorDraft} onChange={(event) => setAuthorDraft(event.target.value)} onBlur={(event) => patchData({ author: parseAuthors(event.target.value) })} placeholder="Last, First; Last, First" /></label>
          <p className="citation-help">Separate authors with semicolons. Put organizations in braces, e.g. <code>{'{Harvard University}'}</code>.</p>
          <label className="citation-field">Year / date<input aria-label="Publication date" disabled={isBuiltIn} value={dateValue(selected.data.issued)} placeholder="YYYY or YYYY-MM-DD" onChange={(event) => patchData({ issued: parseDate(event.target.value) })} /></label>
          <label className="citation-field">DOI<div className="citation-input-action"><input aria-label="Reference DOI" disabled={isBuiltIn} value={selected.data.DOI || ''} placeholder="10.…" onChange={(event) => patchData({ DOI: event.target.value })} onBlur={() => selected.data.DOI && patchData({ DOI: normalizeDoi(selected.data.DOI) })} /><button disabled={isBuiltIn || busy || !selected.data.DOI} onClick={() => void retryDoi()}>Look up</button></div></label>
          <label className="citation-field">Website URL<input aria-label="Reference URL" disabled={isBuiltIn} type="url" value={selected.data.URL || ''} placeholder="https://…" onChange={(event) => patchData({ URL: event.target.value })} /></label>
          <details className="citation-extra-fields"><summary>Publication details and more</summary><label className="citation-field">Journal / book title<input aria-label="Journal or book title" disabled={isBuiltIn} value={selected.data['container-title'] || ''} onChange={(event) => patchData({ 'container-title': event.target.value })} /></label><div className="citation-field-pair"><label className="citation-field">Publisher<input aria-label="Publisher" disabled={isBuiltIn} value={selected.data.publisher || ''} onChange={(event) => patchData({ publisher: event.target.value })} /></label><label className="citation-field">Access date<input aria-label="Access date" disabled={isBuiltIn} type="date" value={dateValue(selected.data.accessed)} onChange={(event) => patchData({ accessed: parseDate(event.target.value) })} /></label></div><div className="citation-field-pair">{([{ key: 'volume', label: 'Volume' }, { key: 'issue', label: 'Issue' }, { key: 'page', label: 'Pages' }, { key: 'edition', label: 'Edition' }, { key: 'ISBN', label: 'ISBN' }, { key: 'ISSN', label: 'ISSN' }] as const).map((field) => <label className="citation-field" key={field.key}>{field.label}<input aria-label={field.label} disabled={isBuiltIn} value={selected.data[field.key] || ''} onChange={(event) => patchData({ [field.key]: event.target.value })} /></label>)}</div><label className="citation-field">Editors<input aria-label="Reference editors" disabled={isBuiltIn} value={editorDraft} onChange={(event) => setEditorDraft(event.target.value)} onBlur={(event) => patchData({ editor: parseAuthors(event.target.value) })} /></label><label className="citation-field">Notes<textarea aria-label="Reference notes" disabled={isBuiltIn} rows={3} value={selected.data.note || ''} onChange={(event) => patchData({ note: event.target.value })} /></label></details>
          <div className="citation-key-section"><label className="citation-field">Citation key<div className="citation-input-action"><input aria-label="Citation key" disabled={isBuiltIn} value={selected.key} onChange={(event) => patchRecord({ key: event.target.value })} onBlur={() => setRecords((prev) => ensureCitationKeys(prev))} /><button disabled={isBuiltIn} onClick={() => { const key = citationKey({ ...selected, key: '' }); setRecords((prev) => ensureCitationKeys(prev.map((r) => r.id === selected.id ? { ...r, key } : r))); }}>Generate</button></div></label>
            <button className="citation-copy-command" onClick={() => void copyOutput(`${backend === 'biblatex' ? '\\autocite' : '\\citep'}{${exportKey}}`, true)}>Copy <code>{backend === 'biblatex' ? '\\autocite' : '\\citep'}{'{'}{exportKey}{'}'}</code></button>
          </div>
          <div className="citation-reference-preview"><span className="diagram-eyebrow">{textStyle === 'apa' ? 'APA' : textStyle === 'harvard1' ? 'Harvard' : 'Vancouver'} preview</span><p>{citationPreview(selected, textStyle)}</p></div>
        </> : <div className="citation-welcome"><div className="citation-welcome-mark" aria-hidden="true">“ ”</div><h3>Your references, ready for LaTeX.</h3><p>Use Import sources on the left, or add a reference manually. Select a source to check its details, then open Export when you are ready.</p><div className="citation-welcome-step"><span>01</span><div><strong>Collect</strong><p>Import journal articles, books, websites, and more.</p></div></div><div className="citation-welcome-step"><span>02</span><div><strong>Review</strong><p>Edit metadata and choose memorable citation keys.</p></div></div><div className="citation-welcome-step"><span>03</span><div><strong>Export</strong><p>Get a .bib file, a complete LaTeX document, or a plain-text bibliography.</p></div></div><button className="citation-primary" onClick={addManual}>Add your first reference</button><p className="citation-help">DOI metadata comes from Crossref or DataCite. Websites that block metadata access are kept for manual review.</p></div>}
      </div>
    </section>

    <section className="citation-export-panel" aria-label="Citation exports" id="citation-export-panel" aria-labelledby="citation-export-tab" hidden={pane !== 'export'}>
      <div className="citation-panel-heading"><span className="diagram-eyebrow">Ready for your document</span><h3>Export references</h3></div>
      <details className="citation-export-settings"><summary>Citation styles and LaTeX options</summary><label className="citation-field">LaTeX workflow<select aria-label="Bibliography workflow" value={backend} onChange={(event) => setBackend(event.target.value as BibliographyBackend)}><option value="bibtex">BibTeX + natbib</option><option value="biblatex">BibLaTeX + Biber</option></select></label><div className="citation-field-pair"><label className="citation-field">LaTeX citation style<select aria-label="LaTeX citation style" value={numeric ? 'numeric' : 'author-year'} onChange={(event) => setNumeric(event.target.value === 'numeric')}><option value="author-year">Author–year</option><option value="numeric">Numeric</option></select></label><label className="citation-field">Plain-text style<select aria-label="Plain text citation style" value={textStyle} onChange={(event) => setTextStyle(event.target.value as TextCitationStyle)}><option value="apa">APA</option><option value="harvard1">Harvard</option><option value="vancouver">Vancouver</option></select></label></div></details>
      <div className="citation-output-tabs" role="tablist" aria-label="Citation output formats">{([{ value: 'bib', name: backend === 'bibtex' ? 'BibTeX' : 'BibLaTeX' }, { value: 'latex', name: 'LaTeX document' }, { value: 'text', name: 'Plain text' }] as const).map((item) => <button key={item.value} role="tab" id={`citation-tab-${item.value}`} aria-controls="citation-output" aria-selected={tab === item.value} tabIndex={tab === item.value ? 0 : -1} onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const tabs: OutputTab[] = ['bib', 'latex', 'text']; const next = tabs[(tabs.indexOf(item.value) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]; setTab(next); document.getElementById(`citation-tab-${next}`)?.focus(); }
      }} onClick={() => setTab(item.value)}>{item.name}</button>)}</div>
      <p className="citation-output-note">{tab === 'bib' ? 'Save as references.bib. The LaTeX document tab includes every required package and build instructions.' : tab === 'latex' ? 'A complete document with embedded bibliography, all required packages, and compilation instructions.' : 'Formatted references you can paste into an email, document, or assignment.'}</p>
      {reviewCount > 0 && <p className="citation-export-review" role="status">{reviewCount} {reviewCount === 1 ? 'reference needs' : 'references need'} review before use.</p>}
      {outputs.error && <p className="citation-field-error" role="alert">{outputs.error}</p>}
      <div id="citation-output" role="tabpanel" aria-labelledby={`citation-tab-${tab}`} className="citation-output-wrap"><textarea className={tab === 'text' ? 'citation-output-text' : ''} aria-label="Citation export output" readOnly value={output} /></div>
      <div className="citation-export-actions"><button className="citation-primary" disabled={!output} onClick={() => void copyOutput()}>{copied ? 'Copied!' : 'Copy output'}</button><button disabled={!output} onClick={() => downloadText(output, tab === 'bib' ? 'references.bib' : tab === 'latex' ? 'references.tex' : 'references.txt')}>Download {tab === 'bib' ? '.bib' : tab === 'latex' ? '.tex' : '.txt'}</button><span role="status">{copyMessage}</span></div>
    </section>
  </main>;
}

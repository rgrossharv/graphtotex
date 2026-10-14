import { Cite, type CSL, type CSLDate, type CSLName, type CSLType } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-ris';
import '@citation-js/plugin-csl';
import { GRAPH_TO_TEX } from './graphToTexCitation';

export interface CitationRecord {
  id: string;
  key: string;
  data: CSL;
  source: 'manual' | 'doi' | 'website' | 'file' | 'software';
  review?: string;
}
export type BibliographyBackend = 'bibtex' | 'biblatex';
export type TextCitationStyle = 'apa' | 'harvard1' | 'vancouver';
export const CITATION_STORAGE_KEY = 'graphtotex-citations-v1';
export const CITATION_TYPES: { value: CSLType; label: string }[] = [
  { value: 'article-journal', label: 'Journal article' }, { value: 'book', label: 'Book' },
  { value: 'chapter', label: 'Book chapter' }, { value: 'paper-conference', label: 'Conference paper' },
  { value: 'webpage', label: 'Website' }, { value: 'thesis', label: 'Thesis' },
  { value: 'report', label: 'Report' }, { value: 'dataset', label: 'Dataset' },
  { value: 'software', label: 'Software' }, { value: 'document', label: 'Other' }
];

export function graphToTexCitation(): CitationRecord {
  return {
    id: 'graphtotex', key: GRAPH_TO_TEX.key, source: 'software',
    data: { id: 'graphtotex', type: 'software', title: GRAPH_TO_TEX.title,
      author: [{ family: 'Gross', given: 'Ryland' }], issued: { 'date-parts': [[GRAPH_TO_TEX.year]] },
      URL: GRAPH_TO_TEX.url }
  };
}

export function newCitation(): CitationRecord {
  const id = crypto.randomUUID();
  return { id, key: '', data: { id, type: 'article-journal', title: '' }, source: 'manual' };
}

export function dateValue(value?: CSLDate): string {
  const parts = value?.['date-parts']?.[0];
  return parts ? parts.map((part, i) => i ? String(part).padStart(2, '0') : String(part)).join('-') : value?.literal || value?.raw || '';
}
export function parseDate(value: string): CSLDate | undefined {
  if (!value.trim()) return undefined;
  if (/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return { 'date-parts': [day ? [year, month, day] : month ? [year, month] : [year]] };
  }
  return { literal: value.trim() };
}
export function authorText(names?: CSLName[]): string {
  return (names || []).map((name) => name.literal ? `{${name.literal}}` : [name.family, name.given].filter(Boolean).join(', ')).join('; ');
}
export function parseAuthors(value: string): CSLName[] {
  return value.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean).map((part) => {
    if (part.startsWith('{') && part.endsWith('}')) return { literal: part.slice(1, -1) };
    if (part.includes(',')) {
      const [family, ...given] = part.split(',');
      return { family: family.trim(), given: given.join(',').trim() };
    }
    const words = part.split(/\s+/);
    return words.length === 1 ? { family: part } : { family: words.pop()!, given: words.join(' ') };
  });
}

export function normalizeDoi(value: string): string {
  let doi = value.trim().replace(/^doi\s*:\s*/i, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  try { doi = decodeURIComponent(doi); } catch { /* Keep a literal DOI if it contains a percent sign. */ }
  return doi.replace(/[.,;]+$/, '').trim();
}

export function citationKey(record: CitationRecord): string {
  const safe = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.:-]/g, '');
  const requested = safe(record.key);
  if (requested) return /^[A-Za-z]/.test(requested) ? requested : `ref_${requested}`;
  const name = record.data.author?.[0]?.family || record.data.author?.[0]?.literal || 'ref';
  const year = String(record.data.issued?.['date-parts']?.[0]?.[0] || '');
  const title = (record.data.title || 'source').split(/\s+/).slice(0, 2).join('');
  return `ref_${safe(name + year + title).slice(0, 48) || 'source'}`;
}

export function citationIdentity(record: CitationRecord): string {
  if (record.data.DOI) return `doi:${normalizeDoi(record.data.DOI).toLowerCase()}`;
  if (record.data.URL) {
    try { const url = new URL(record.data.URL); url.hash = ''; return `url:${url.href.replace(/\/$/, '')}`; } catch { /* Compare text for an invalid URL. */ }
  }
  return record.data.title?.trim() ? `title:${record.data.title.trim().toLowerCase()}|${authorText(record.data.author).toLowerCase()}|${dateValue(record.data.issued)}` : `id:${record.id}`;
}

export function mergeCitations(existing: CitationRecord[], incoming: CitationRecord[]): { records: CitationRecord[]; duplicates: number } {
  const records = existing.filter((record) => record.id !== 'graphtotex');
  const identities = new Set([citationIdentity(graphToTexCitation()), ...records.map(citationIdentity)]);
  const keys = new Set(['gross_graphtotex', ...records.map((r) => r.key)]);
  let duplicates = 0;
  for (const record of incoming) {
    const identity = citationIdentity(record);
    if (identities.has(identity)) { duplicates++; continue; }
    const base = citationKey(record);
    let key = base, suffix = 2;
    while (keys.has(key)) key = `${base}_${suffix++}`;
    identities.add(identity); keys.add(key); records.push({ ...record, key });
  }
  return { records: [graphToTexCitation(), ...records], duplicates };
}

export function ensureCitationKeys(records: CitationRecord[]): CitationRecord[] {
  const used = new Set<string>();
  return [graphToTexCitation(), ...records.filter((r) => r.id !== 'graphtotex')].map((record) => {
    const base = citationKey(record);
    let key = base, suffix = 2;
    while (used.has(key)) key = `${base}_${suffix++}`;
    used.add(key);
    return { ...record, key };
  });
}

export function bibliography(records: CitationRecord[], backend: BibliographyBackend): string {
  const data = ensureCitationKeys(records).map((record) => ({ ...record.data, id: record.key, 'citation-key': record.key }));
  return String(new Cite(data).format(backend, { format: 'text' }));
}
export function plainBibliography(records: CitationRecord[], style: TextCitationStyle): string {
  const data = ensureCitationKeys(records).map((record) => ({ ...record.data, id: record.key }));
  return new Cite(data).format('bibliography', { format: 'text', style, lang: 'en-US' });
}
export function citationPreview(record: CitationRecord, style: TextCitationStyle): string {
  try { return new Cite([{ ...record.data, id: record.id }]).format('bibliography', { format: 'text', style, lang: 'en-US' }).trim(); }
  catch { return record.data.title || record.data.DOI || record.data.URL || 'Untitled reference'; }
}

export function latexBibliographyDocument(records: CitationRecord[], backend: BibliographyBackend, numeric = false): string {
  const bib = bibliography(records, backend);
  const isModern = backend === 'biblatex';
  const first = ensureCitationKeys(records).find((r) => r.id !== 'graphtotex')?.key || 'gross_graphtotex';
  return [
    '% Generated by GraphToTeX. This file includes its own references.bib.',
    `% Compile: pdflatex references; ${isModern ? 'biber' : 'bibtex'} references; pdflatex references; pdflatex references.`,
    '\\begin{filecontents*}[overwrite]{references.bib}', bib, '\\end{filecontents*}',
    '\\documentclass{article}', '\\usepackage[T1]{fontenc}', '\\usepackage[utf8]{inputenc}',
    ...(isModern ? ['\\usepackage{csquotes}', `\\usepackage[backend=biber,style=${numeric ? 'numeric' : 'authoryear'},sorting=nyt]{biblatex}`, '\\addbibresource{references.bib}'] : [`\\usepackage[${numeric ? 'numbers,sort&compress' : 'authoryear'}]{natbib}`]),
    '\\usepackage{xurl}', '\\usepackage[hidelinks]{hyperref}',
    '\\begin{document}', '\\section*{References}',
    `% Example inline citation: ${isModern ? '\\autocite' : '\\citep'}{${first}}`,
    '% GraphToTeX is included in the bibliography below.', '\\nocite{*}',
    ...(isModern ? ['\\printbibliography[heading=none]'] : ['\\bibliographystyle{plainnat}', '\\bibliography{references}']),
    '\\end{document}'
  ].join('\n');
}

function cleanText(value: string): string {
  if (typeof DOMParser !== 'undefined') return new DOMParser().parseFromString(value, 'text/html').body.textContent?.trim() || '';
  return value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
}
function firstText(value: unknown): string {
  return typeof value === 'string' ? cleanText(value) : Array.isArray(value) && typeof value[0] === 'string' ? cleanText(value[0]) : '';
}

export function fromCrossref(message: Record<string, unknown>): CSL {
  const typeMap: Record<string, CSLType> = { 'journal-article': 'article-journal', book: 'book', 'book-chapter': 'chapter', 'proceedings-article': 'paper-conference', dissertation: 'thesis', report: 'report', dataset: 'dataset' };
  const author = Array.isArray(message.author) ? message.author.map((a: Record<string, string>) => a.family || a.given ? { family: a.family, given: a.given } : { literal: a.name || '' }) : [];
  const issued = (message['published-print'] || message['published-online'] || message.issued || message.published) as CSLDate | undefined;
  return {
    id: crypto.randomUUID(), type: typeMap[String(message.type)] || 'document', title: firstText(message.title),
    author, issued, DOI: String(message.DOI || ''), URL: String(message.URL || ''),
    'container-title': firstText(message['container-title']), publisher: firstText(message.publisher),
    volume: firstText(message.volume), issue: firstText(message.issue), page: firstText(message.page),
    ISBN: firstText(message.ISBN), ISSN: firstText(message.ISSN), abstract: firstText(message.abstract)
  };
}

async function fetchWithTimeout(url: string, signal?: AbortSignal, timeout = 12000): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    return response;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function lookupDoi(value: string, signal?: AbortSignal): Promise<CitationRecord> {
  const doi = normalizeDoi(value);
  if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) throw new Error('Enter a valid DOI, such as 10.1038/nphys1170.');
  let data: CSL;
  try {
    const response = await fetchWithTimeout(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, signal);
    const json = await response.json();
    data = fromCrossref(json.message);
  } catch (error) {
    if (signal?.aborted) throw error;
    const response = await fetchWithTimeout(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`, signal);
    const json = await response.json();
    const a = json.data.attributes;
    data = { id: crypto.randomUUID(), type: a.types?.citeproc || 'dataset', title: firstText(a.titles?.[0]?.title),
      author: (a.creators || []).map((creator: Record<string, string>) => creator.familyName ? { family: creator.familyName, given: creator.givenName } : { literal: creator.name }),
      issued: parseDate(String(a.publicationYear || '')), publisher: typeof a.publisher === 'string' ? a.publisher : a.publisher?.name,
      URL: a.url || `https://doi.org/${doi}`, DOI: doi };
  }
  data.DOI = doi;
  return { id: String(data.id), key: '', data, source: 'doi', review: data.title ? undefined : 'No title was returned. Add the title before using this reference.' };
}

export function websiteFromHtml(url: string, html: string): CSL {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = (...names: string[]) => {
    for (const name of names) {
      const value = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content');
      if (value) return cleanText(value);
    }
    return '';
  };
  const authors = Array.from(doc.querySelectorAll('meta[name="citation_author"]')).map((item) => item.getAttribute('content') || '').filter(Boolean);
  const data: CSL = { id: crypto.randomUUID(), type: 'webpage', URL: url,
    title: meta('citation_title', 'og:title', 'twitter:title') || doc.title.trim(),
    author: parseAuthors(authors.length ? authors.join('; ') : meta('author', 'dc.creator')),
    issued: parseDate(meta('citation_publication_date', 'article:published_time', 'date').replace(/\//g, '-').slice(0, 10)),
    publisher: meta('og:site_name'), accessed: parseDate(new Date().toISOString().slice(0, 10)) };
  const doi = meta('citation_doi', 'dc.identifier');
  if (/10\.\d{4,9}\//.test(doi)) data.DOI = normalizeDoi(doi);
  return data;
}

async function lookupWebsite(value: string, signal?: AbortSignal): Promise<CitationRecord> {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https website URLs are supported.');
  const id = crypto.randomUUID();
  try {
    const response = await fetchWithTimeout(url.href, signal, 7000);
    const data = websiteFromHtml(url.href, await response.text());
    return { id: String(data.id), key: '', data, source: 'website', review: data.title ? undefined : 'Add a page title and check the website metadata.' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { id, key: '', source: 'website', data: { id, type: 'webpage', URL: url.href, title: '', accessed: parseDate(new Date().toISOString().slice(0, 10)) },
      review: 'The website did not allow metadata access. URL and access date were saved; add its title and author manually.' };
  }
}

export interface CitationImportResult { records: CitationRecord[]; issues: string[] }
export async function importCitationSources(text: string, signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<CitationImportResult> {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { records: [], issues: ['No sources found.'] };
  if (/^\s*@\w+\s*[{(]/m.test(trimmed) || /^TY\s*-/m.test(trimmed) || /^[\[{]/.test(trimmed)) {
    let input: unknown = trimmed;
    if (/^[\[{]/.test(trimmed)) {
      const json = JSON.parse(trimmed);
      input = json.message?.DOI ? [fromCrossref(json.message)] : Array.isArray(json) ? json : json.items || [json];
    }
    const data = new Cite(input).data;
    const records = data.map((item) => ({ id: crypto.randomUUID(), key: item['citation-key'] || '', data: item, source: 'file' as const }));
    return { records, issues: records.length ? [] : ['The file contained no bibliography entries.'] };
  }
  const tokens = trimmed.match(/https?:\/\/[^\s<>"{}]+|(?:doi\s*:\s*)?10\.\d{4,9}\/[^\s<>"{}]+/gi) || [];
  const items = [...new Set(tokens.map((token) => token.replace(/[.,;]+$/, '')))];
  const records: CitationRecord[] = [], issues: string[] = [];
  if (!items.length) return { records, issues: ['No DOI or website URLs found. Paste one per line, or use a BibTeX, RIS, or CSL JSON file.'] };
  let next = 0, done = 0;
  onProgress?.(0, items.length);
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const token = items[next++];
      const isDoi = /^(?:doi\s*:|10\.|https?:\/\/(?:dx\.)?doi\.org\/)/i.test(token);
      try { records.push(isDoi ? await lookupDoi(token, signal) : await lookupWebsite(token, signal)); }
      catch (error) {
        if (signal?.aborted) break;
        if (isDoi) {
          const id = crypto.randomUUID(), doi = normalizeDoi(token);
          records.push({ id, key: '', source: 'doi', data: { id, type: 'article-journal', DOI: doi, URL: `https://doi.org/${doi}`, title: '' }, review: 'DOI lookup failed. Retry it or enter the metadata manually.' });
        } else issues.push(`${token}: ${error instanceof Error ? error.message : 'Import failed.'}`);
      }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (signal?.aborted) issues.push('Import cancelled. Completed sources were kept.');
  return { records, issues };
}

export function loadCitations(): CitationRecord[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CITATION_STORAGE_KEY) || 'null');
    if (Array.isArray(saved) && saved.every((r) => r && typeof r.id === 'string' && typeof r.key === 'string' && r.data && typeof r.data.type === 'string')) {
      // Parsing through Citation.js also validates imported CSL metadata.
      new Cite(saved.map((r: CitationRecord) => r.data));
      return ensureCitationKeys(saved);
    }
  } catch { /* Start a new library if storage is unavailable or invalid. */ }
  return [graphToTexCitation()];
}

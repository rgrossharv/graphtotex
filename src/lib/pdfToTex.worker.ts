/// <reference lib="webworker" />
import { getDocument, GlobalWorkerOptions, OPS, Util } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import { zipSync, strToU8, type Zippable } from 'fflate';
import { createTexDocument, parsePageSelection, type PdfTexOptions, type PdfTexPage, type PdfTexResponse } from './pdfToTex';
import { extractPdfRules, type PdfRule } from './pdfMathGeometry';

interface WasmEngine { default: (options?: unknown) => Promise<unknown>; reconstruct_page: (page: string, mode: string) => string; convert_document_bytes: (data: Uint8Array, format: string) => string }
const worker = self as unknown as DedicatedWorkerGlobalScope;
const send = (message: PdfTexResponse, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
const base = new URL(import.meta.env.BASE_URL, worker.location.origin);
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// PDF.js's default display factories require the DOM even for text-only work.
// Provide its documented CanvasFactory/FilterFactory hooks for a worker context.
type CanvasPair = { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D };
class WorkerCanvasFactory {
  create(width: number, height: number): CanvasPair {
    if (width <= 0 || height <= 0) throw new Error('Invalid PDF canvas size.');
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PDF canvas unavailable.');
    return { canvas, context };
  }
  reset(pair: CanvasPair, width: number, height: number) { pair.canvas.width = width; pair.canvas.height = height; }
  destroy(pair: CanvasPair) { pair.canvas.width = 0; pair.canvas.height = 0; }
}
// Matches PDF.js's non-DOM filter factory. SVG transfer filters cannot be used
// by OffscreenCanvas; note this limit for rasterized protected pages.
class WorkerFilterFactory {
  addFilter() { return 'none'; }
  addHCMFilter() { return 'none'; }
  addAlphaFilter() { return 'none'; }
  addLuminosityFilter() { return 'none'; }
  addHighlightHCMFilter() { return 'none'; }
  destroy() { /* no DOM filter resources */ }
}

async function preserveEncryptedPage(page: PDFPageProxy, filename: string, files: Zippable): Promise<string> {
  const size = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, 3000 / Math.max(size.width, size.height)) });
  if (typeof OffscreenCanvas === 'undefined') throw new Error('Preserving password-protected pages requires OffscreenCanvas. Try a current browser or the CLI.');
  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not render this protected page.');
  await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
  files[filename] = [new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()), { level: 0 }];
  canvas.width = 1; canvas.height = 1;
  return `% Page ${page.pageNumber}: rendered from a password-protected PDF.\n\\begin{center}\n\\includegraphics[width=\\textwidth,height=0.95\\textheight,keepaspectratio]{${filename}}\n\\end{center}\n\\clearpage\n`;
}

worker.onmessage = async (event: MessageEvent<{ file: File; options: PdfTexOptions }>) => {
  const { file, options } = event.data;
  const start = performance.now();
  let loading: ReturnType<typeof getDocument> | undefined;
  let parser: Worker | undefined;
  try {
    if (file.size > 250 * 1024 * 1024) throw new Error('This browser tool accepts PDFs up to 250 MB. Use the CLI for larger files.');
    send({ type: 'progress', message: 'Loading PDF and WebAssembly engine…', completed: 0, total: 0 });
    // Lazy, same-origin assets: no PDF bytes or passwords leave the browser.
    const wasmPath = new URL('vendor/pdf-to-tex/graphtotex_pdf_core.js', base).href;
    const [bytes, engine] = await Promise.all([
      file.arrayBuffer(),
      import(/* @vite-ignore */ wasmPath).then(async (module: WasmEngine) => { await module.default(); return module; })
        .catch(() => { throw new Error('The WebAssembly engine could not load. Reload the page, or check that the site was built with npm run build:wasm.'); })
    ]);
    const data = new Uint8Array(bytes);
    const format=file.name.split('.').pop()?.toLowerCase() || 'pdf';
    if (format !== 'pdf') {
      const converted=JSON.parse(engine.convert_document_bytes(data,format)) as {tex:string;text:string;blocks:number;equations:number;warnings:string[];format:string;assets:{name:string;data:string}[]};
      const files:Zippable={ 'document.tex':strToU8(converted.tex), 'README.txt':strToU8('Direct conversion without a PDF intermediate. Compile document.tex with LuaLaTeX. Keep assets/ alongside it. Review conversion warnings in report.json.\n') };
      for (const asset of converted.assets) { const decoded=atob(asset.data); files[asset.name]=[Uint8Array.from(decoded,c=>c.charCodeAt(0)),{level:0}]; }
      files['report.json']=strToU8(JSON.stringify({format:converted.format,blocks:converted.blocks,equations:converted.equations,warnings:converted.warnings},null,2));
      const archive=zipSync(files,{level:6}) as Uint8Array<ArrayBuffer>;
      send({type:'result',result:{tex:converted.tex,archive,pages:[{number:1,tex:'',characters:converted.text.length,preserved:false,warnings:converted.warnings}],elapsedMs:performance.now()-start,sourceName:file.name,format:converted.format,blocks:converted.blocks,equations:converted.equations}},[archive.buffer]);
      return;
    }
    if (!new TextDecoder().decode(data.subarray(0, 1024)).includes('%PDF-')) throw new Error('This file does not have a PDF header. Choose a PDF document.');
    // Supplying the port bypasses PDF.js's window.location-based worker bootstrap.
    parser = new Worker(GlobalWorkerOptions.workerSrc, { type: 'module' });
    GlobalWorkerOptions.workerPort = parser;
    loading = getDocument({ data, password: options.password || undefined, isEvalSupported: false,
      useWorkerFetch: true, disableFontFace: true, useSystemFonts: false,
      CanvasFactory: WorkerCanvasFactory, FilterFactory: WorkerFilterFactory,
      cMapUrl: new URL('vendor/pdfjs/cmaps/', base).href, cMapPacked: true,
      standardFontDataUrl: new URL('vendor/pdfjs/standard_fonts/', base).href });
    const document = await loading.promise;
    const metadata = await document.getMetadata().catch(() => null);
    // Owner-protected PDFs may open with an empty user password. They still
    // cannot be embedded directly by TeX and need the protected-page fallback.
    const encrypted = !!options.password || !!(metadata?.info as Record<string, unknown> | undefined)?.EncryptFilterName;
    const selected = parsePageSelection(options.pages, document.numPages);
    const pages: PdfTexPage[] = [];
    const files: Zippable = {};
    for (const number of selected) {
      send({ type: 'progress', message: `Reconstructing page ${number} · ${pages.length + 1} of ${selected.length}…`, completed: pages.length, total: selected.length });
      const page = await document.getPage(number);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const spans = [];
        let rules: PdfRule[] = [];
        let complex = false;
        if (options.mode !== 'visual') {
          const text = await page.getTextContent();
          // The operator list resolves actual font names and painted fraction /
          // radical bars. Generic text-style families discard that information.
          const operators = text.items.length > 0 ? await page.getOperatorList() : null;
          for (const item of text.items) {
            if (!('str' in item) || !item.str.trim()) continue;
            const transform = Util.transform(viewport.transform, item.transform);
            const family = text.styles[item.fontName]?.fontFamily || '';
            const font = page.commonObjs.has(item.fontName)
              ? page.commonObjs.get(item.fontName) as { name?: string; bold?: boolean; italic?: boolean } : undefined;
            spans.push({ text: item.str, x: transform[4], y: transform[5], width: item.width,
              size: Math.hypot(transform[2], transform[3]) || item.height || 11,
              font: font?.name || family,
              bold: !!font?.bold || /bold|black|heavy/i.test(family), italic: !!font?.italic || /italic|oblique/i.test(family),
              rotated: item.dir === 'ttb' || Math.abs(transform[1]) > Math.abs(transform[0]) * 0.1 || transform[0] < 0 });
          }
          // Textless pages already fall back; do not decode their images just
          // to rediscover that they should be preserved.
          if (operators) {
            rules = extractPdfRules(operators, viewport.transform);
            // Any embedded image or painted path warrants a conservative visual fallback.
            complex = operators.fnArray.some(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject
              || op === OPS.paintImageMaskXObject || op === OPS.constructPath || op === OPS.shadingFill);
          }
        }
        const result: PdfTexPage = JSON.parse(engine.reconstruct_page(JSON.stringify({ number, width: viewport.width, height: viewport.height, spans, rules, complex }), options.mode));
        if (options.mode === 'visual') result.warnings = []; // Text extraction deliberately skipped in this mode.
        if (result.preserved && encrypted) {
          result.tex = await preserveEncryptedPage(page, `page-${number}.png`, files);
          result.warnings.push('Protected page rasterized; SVG transfer filters and original vector resolution are not retained.');
        }
        pages.push(result);
      } catch (error) {
        // A text/parser failure must never silently drop a page in the safe modes.
        if (options.mode === 'editable') throw error;
        const result: PdfTexPage = { number, characters: 0, preserved: true,
          warnings: ['Text extraction failed; the original page was preserved.'],
          tex: `\\includepdf[pages={${number}},fitpaper=true]{source.pdf}\n` };
        if (encrypted) result.tex = await preserveEncryptedPage(page, `page-${number}.png`, files);
        pages.push(result);
      } finally { page.cleanup(); }
    }
    const tex = createTexDocument(pages);
    send({ type: 'progress', message: 'Packaging the LaTeX project…', completed: pages.length, total: pages.length });
    // PDF.js owns/transfers its input buffer. Read again only when the ZIP needs it.
    if (pages.some(page => page.preserved) && !encrypted) files['source.pdf'] = [new Uint8Array(await file.arrayBuffer()), { level: 0 }];
    files['document.tex'] = strToU8(tex);
    files['report.json'] = strToU8(JSON.stringify({ source: file.name, mode: options.mode, pages: pages.map(({ tex: _tex, ...page }) => page) }, null, 2));
    files['README.txt'] = strToU8('Compile document.tex with LuaLaTeX (lualatex document.tex), or select LuaLaTeX in Overleaf.\nKeep all project files together.\nEditable pages are approximate: review reading order, math, tables, and fonts.\nPreserved pages retain their appearance but are not editable LaTeX. Scans require OCR for editable text.\n');
    const archive = zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>;
    send({ type: 'result', result: { tex, archive, pages, elapsedMs: performance.now() - start, sourceName: file.name } }, [archive.buffer]);
  } catch (failure) {
    const error = failure as Error & { code?: number };
    const passwordRequired = error.name === 'PasswordException';
    send({ type: 'error', passwordRequired, message: passwordRequired ? 'This PDF needs its password. Enter it below and try again.' : error.message || 'PDF conversion failed.' });
  } finally { try { await loading?.destroy(); } finally { parser?.terminate(); } }
};

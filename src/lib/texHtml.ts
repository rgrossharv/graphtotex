export interface HtmlSlide { image: string; text: string }
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function createSlideHtml(slides: HtmlSlide[], title: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'">
<style>*{box-sizing:border-box}body{margin:0;background:#1b1d1f;color:#e5e6e7;font:14px system-ui,sans-serif}main{height:calc(100dvh - 58px);display:grid;place-items:center;padding:12px}.slide{display:none;width:100%;height:100%;min-height:0;text-align:center}.slide.active{display:flex;justify-content:center;align-items:center}.slide img{display:block;max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 3px 18px #0005}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}nav{min-height:58px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;padding:8px;border-top:1px solid #3b3d40}button{border:1px solid #555;border-radius:4px;padding:7px 12px;color:inherit;background:#2a2c2e;cursor:pointer}button:hover{background:#3b3d40}button:focus-visible{outline:2px solid #8ac6ba;outline-offset:2px}button:disabled{opacity:.3;cursor:default}#count{min-width:70px;text-align:center}.reading main{display:block;height:auto}.reading .slide{display:block;height:auto;margin-bottom:20px}.reading .slide img{margin:auto;max-width:100%;height:auto}.reading nav{position:sticky;bottom:0;background:#1b1d1f}@media print{body{background:#fff}main{display:block;height:auto;padding:0}.slide,.slide.active{display:block;height:auto;break-after:page}.slide img{width:100%;max-height:100vh;box-shadow:none}nav{display:none}}</style></head>
<body><main aria-label="${escape(title)}">${slides.map((slide, index) => `<section class="slide${index === 0 ? ' active' : ''}" aria-roledescription="slide" aria-label="Slide ${index + 1} of ${slides.length}"${index ? ' hidden' : ''}><img src="${slide.image}" alt="Slide ${index + 1}"><div class="sr-only">${escape(slide.text)}</div></section>`).join('\n')}</main>
<nav aria-label="Slide navigation"><button id="prev" aria-label="Previous slide">← Previous</button><span id="count" role="status" aria-live="polite"></span><button id="next" aria-label="Next slide">Next →</button><button id="all" aria-pressed="false">All pages</button><button id="fullscreen">Full screen</button></nav>
<script>(()=>{const slides=[...document.querySelectorAll('.slide')];let index=0,reading=false;const prev=document.getElementById('prev'),next=document.getElementById('next'),count=document.getElementById('count');function show(n){index=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,i)=>{s.hidden=!reading&&i!==index;s.classList.toggle('active',i===index)});count.textContent=(index+1)+' / '+slides.length;prev.disabled=index===0;next.disabled=index===slides.length-1}prev.onclick=()=>show(index-1);next.onclick=()=>show(index+1);document.getElementById('all').onclick=e=>{reading=!reading;document.body.classList.toggle('reading',reading);e.currentTarget.setAttribute('aria-pressed',String(reading));show(index)};document.getElementById('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.().catch(()=>{})};document.addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();show(index+1)}else if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();show(index-1)}else if(e.key==='Home'){e.preventDefault();show(0)}else if(e.key==='End'){e.preventDefault();show(slides.length-1)}});show(0)})();</script></body></html>`;
}

export async function pdfToSlides(pdf: Uint8Array<ArrayBuffer>, onProgress: (message: string) => void, signal: AbortSignal): Promise<HtmlSlide[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const loading = pdfjs.getDocument({ data: pdf.slice(), isEvalSupported: false });
  const stop = () => { void loading.destroy(); };
  signal.addEventListener('abort', stop, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Conversion cancelled.', 'AbortError');
    const document = await loading.promise;
    if (document.numPages > 100) throw new Error('HTML export supports up to 100 pages. Split a longer document into smaller files.');
    const slides: HtmlSlide[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      if (signal.aborted) throw new DOMException('Conversion cancelled.', 'AbortError');
      onProgress(`Creating HTML slide ${index} of ${document.numPages}…`);
      const page = await document.getPage(index);
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.5, 1800 / size.width, 2200 / size.height) });
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not render the PDF pages.');
      await page.render({ canvasContext: context, viewport }).promise;
      const text = (await page.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ');
      slides.push({ image: canvas.toDataURL('image/png'), text });
      page.cleanup(); canvas.width = 0; canvas.height = 0;
    }
    return slides;
  } finally { signal.removeEventListener('abort', stop); await loading.destroy(); }
}

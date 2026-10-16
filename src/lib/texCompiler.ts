export interface TexAsset { name: string; data: Uint8Array<ArrayBuffer> }
export class TexCompileError extends Error {
  constructor(message: string, public log: string) { super(message); }
}

export function compileTex(source: string, assets: TexAsset[], signal: AbortSignal, onProgress: (message: string) => void): Promise<{ pdf: Uint8Array<ArrayBuffer>; log: string }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/vendor/swiftlatex/swiftlatexpdftex.js');
    let pass = 1;
    let settled = false;
    const finish = (error?: Error, output?: { pdf: Uint8Array<ArrayBuffer>; log: string }) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate();
      if (error) reject(error); else resolve(output!);
    };
    const abort = () => finish(new DOMException('Compilation cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Compilation timed out. Check your connection or try a smaller document.')), 180000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    onProgress('Loading the TeX compiler…');
    worker.onerror = () => finish(new Error('The TeX compiler could not load. Check your connection and try again.'));
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.cmd === 'progress') { onProgress(`Loading ${data.file}…`); return; }
      if (data.cmd === 'writefile' && data.result !== 'ok') { finish(new Error('A supporting file could not be loaded. Check its filename.')); return; }
      if (!data.cmd && data.result === 'ok') {
        worker.postMessage({ cmd: 'settexliveurl', url: 'https://texlive.texlyre.org/' });
        const folders = new Set<string>();
        for (const asset of assets) {
          const path = asset.name.split('/');
          if (path.some((part) => !part || part === '.' || part === '..')) { finish(new Error('Supporting files need simple relative paths.')); return; }
          for (let i = 1; i < path.length; i++) {
            const folder = path.slice(0, i).join('/');
            if (!folders.has(folder)) { worker.postMessage({ cmd: 'mkdir', url: folder }); folders.add(folder); }
          }
          if (asset.name !== 'main.tex') worker.postMessage({ cmd: 'writefile', url: asset.name, src: asset.data });
        }
        worker.postMessage({ cmd: 'writefile', url: 'main.tex', src: source });
        worker.postMessage({ cmd: 'setmainfile', url: 'main.tex' });
        onProgress('Compiling your document · pass 1 of 2…');
        worker.postMessage({ cmd: 'compilelatex' });
      } else if (data.cmd === 'compile') {
        if (data.result !== 'ok' || !data.pdf) {
          const log = String(data.log || 'No compilation log was returned.');
          const firstError = log.match(/^!\s*(.+)$/m)?.[1];
          finish(new TexCompileError(firstError || 'TeX could not compile this document. Open the compilation log for details.', log));
        } else if (pass === 1) {
          pass = 2; onProgress('Resolving references · pass 2 of 2…'); worker.postMessage({ cmd: 'compilelatex' });
        } else finish(undefined, { pdf: new Uint8Array(data.pdf), log: String(data.log || '') });
      } else if (!data.cmd && data.result === 'failed') finish(new Error('The TeX engine could not initialize.'));
    };
  });
}

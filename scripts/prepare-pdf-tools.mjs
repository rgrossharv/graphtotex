import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
if (!existsSync('public/vendor/pdf-to-tex/graphtotex_pdf_core_bg.wasm')) {
  throw new Error('Build the PDF WebAssembly engine first: npm run build:wasm (see native/README.md for prerequisites).');
}
for (const folder of ['cmaps', 'standard_fonts']) {
  cpSync(`node_modules/pdfjs-dist/${folder}`, `public/vendor/pdfjs/${folder}`, { recursive: true });
}
cpSync('node_modules/pdfjs-dist/LICENSE', 'public/vendor/pdfjs/LICENSE');
mkdirSync('public/downloads', { recursive: true });
const source = {};
function collect(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'target') continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) collect(path);
    else source[`graphtotex-pdf/${path}`] = new Uint8Array(readFileSync(path));
  }
}
collect('native');
source['graphtotex-pdf/LICENSE'] = new Uint8Array(readFileSync('LICENSE'));
writeFileSync('public/downloads/graphtotex-pdf-source.zip', zipSync(source, { level: 9 }));
const labels = { 'arm64-darwin': 'macOS · Apple Silicon', 'x64-darwin': 'macOS · Intel', 'x64-linux': 'Linux · x64', 'x64-win32': 'Windows · x64', 'x86_64-unknown-linux-gnu': 'Linux · x64', 'x86_64-pc-windows-msvc': 'Windows · x64', 'x86_64-apple-darwin': 'macOS · Intel', 'aarch64-apple-darwin': 'macOS · Apple Silicon' };
const files = readdirSync('public/downloads').filter(name => /^graphtotex-pdf-.*\.zip$/.test(name)).sort().map(name => ({
  name, bytes: statSync(`public/downloads/${name}`).size,
  label: name === 'graphtotex-pdf-source.zip' ? 'Rust source · all platforms' : labels[name.slice('graphtotex-pdf-'.length, -4)] || name
}));
writeFileSync('public/downloads/pdf-to-tex.json', JSON.stringify({ files }, null, 2));

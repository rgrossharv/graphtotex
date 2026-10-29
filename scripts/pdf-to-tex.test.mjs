import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';
import { unzipSync } from 'fflate';
import { fixturePdf } from './pdf-fixtures.mjs';
import { initSync, reconstruct_page } from '../public/vendor/pdf-to-tex/graphtotex_pdf_core.js';

const { code } = await transformWithEsbuild(await readFile('src/lib/pdfToTex.ts', 'utf8'), 'pdfToTex.ts');
const { parsePageSelection, createTexDocument, pdfTexBaseName } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
initSync({ module: await readFile('public/vendor/pdf-to-tex/graphtotex_pdf_core_bg.wasm') });
const page = (spans, complex = false) => ({ number: 1, width: 612, height: 792, spans, complex });
const span = (text, x, y, size = 11) => ({ text, x, y, size, width: 80 });
const convert = (input, mode = 'auto') => JSON.parse(reconstruct_page(JSON.stringify(input), mode));

test('page ranges are bounded, deduplicated, and returned in document order', () => {
  assert.deepEqual(parsePageSelection('3, 1-2, 2', 3), [1, 2, 3]);
  assert.deepEqual(parsePageSelection('', 2), [1, 2]);
  for (const input of ['0', '2-1', '1-99999999999999', 'foo', '1,', '1.5']) assert.throws(() => parsePageSelection(input, 10));
});
test('real WASM sorts text, infers headings, escapes TeX, and preserves complex pages', () => {
  const result = convert(page([span('100% & safe_text', 40, 100), span('Title', 40, 40, 22), span('More body text to establish the font size.', 40, 120)]));
  assert.equal(result.preserved, false); assert.match(result.tex, /\\section\*\{Title\}/);
  assert.match(result.tex, /100\\% \\& safe\\_text/);
  assert.equal(convert(page([])).preserved, true);
  assert.equal(convert(page([span('Caption', 40, 40)], true)).preserved, true);
  assert.equal(convert(page([span('Caption', 40, 40)], true), 'editable').preserved, false);
});
test('WASM prevents input text from creating TeX commands and handles Unicode', () => {
  const result = convert(page([span('\\input{secret} ﬁ π ∞', 40, 40)]), 'editable');
  assert.match(result.tex, /\\textbackslash\{\}input\\\{secret\\\}/);
  assert.match(result.tex, /fi \\ensuremath\{\\pi\} \\ensuremath\{\\infty\}/);
  assert.throws(() => reconstruct_page('{bad json', 'auto'));
  assert.throws(() => reconstruct_page(JSON.stringify(page([])), 'unknown'));
});
test('document wrapper uses LuaLaTeX and preserved assets are explicit', () => {
  const tex = createTexDocument([convert(page([]))]);
  assert.match(tex, /\\usepackage\{fontspec\}/);
  assert.match(tex, /\\includepdf\[pages=\{1\},fitpaper=true\]\{source.pdf\}/);
  assert.match(tex, /\\end\{document\}/);
  assert.equal(pdfTexBaseName('hello world.PDF'), 'hello-world');
  assert.equal(pdfTexBaseName('.pdf'), 'document');
});
test('download manifest contains real archives and a portable Rust source tree', async () => {
  const manifest = JSON.parse(await readFile('public/downloads/pdf-to-tex.json', 'utf8'));
  assert.ok(manifest.files.length);
  for (const item of manifest.files) assert.equal((await readFile(`public/downloads/${item.name}`)).byteLength, item.bytes);
  const files = unzipSync(new Uint8Array(await readFile('public/downloads/graphtotex-pdf-source.zip')));
  assert.ok(files['graphtotex-pdf/native/Cargo.toml']); assert.ok(files['graphtotex-pdf/native/Cargo.lock']);
  assert.ok(files['graphtotex-pdf/native/cli/src/main.rs']);
});
test('packaged CLI converts mixed PDFs, preserves assets, and rejects overwrite', async t => {
  const names = await readdir('public/downloads');
  const triples = { 'linux-x64': 'x86_64-unknown-linux-gnu', 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'win32-x64': 'x86_64-pc-windows-msvc' };
  const archive = names.find(name => name === `graphtotex-pdf-${process.arch}-${process.platform}.zip` || name === `graphtotex-pdf-${triples[`${process.platform}-${process.arch}`]}.zip`);
  if (!archive) { t.skip('Run npm run build:cli for this platform.'); return; }
  const directory = await mkdtemp(join(tmpdir(), 'graphtotex-pdf-'));
  try {
    const files = unzipSync(new Uint8Array(await readFile(`public/downloads/${archive}`)));
    const name = process.platform === 'win32' ? 'graphtotex-pdf.exe' : 'graphtotex-pdf';
    const binary = join(directory, name); await writeFile(binary, files[name]); await chmod(binary, 0o755);
    const pdf = join(directory, 'input.pdf'); await writeFile(pdf, fixturePdf());
    const out = join(directory, 'auto'); execFileSync(binary, [pdf, '-o', out], { stdio: 'pipe' });
    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
    assert.deepEqual(report.map(p => p.preserved), [false, true, true]);
    assert.match(await readFile(join(out, 'document.tex'), 'utf8'), /Hello world/);
    assert.deepEqual(await readFile(join(out, 'source.pdf')), Buffer.from(fixturePdf()));
    assert.throws(() => execFileSync(binary, [pdf, '-o', out], { stdio: 'pipe' }));
    const selected = join(directory, 'selected');
    execFileSync(binary, [pdf, '-o', selected, '--pages', '1', '--mode', 'editable'], { stdio: 'pipe' });
    assert.equal(existsSync(join(selected, 'source.pdf')), false);
    const encrypted = join(directory, 'protected');
    execFileSync(binary, ['scripts/fixtures/password-test.pdf', '-o', encrypted], { stdio: 'pipe', env: { ...process.env, PDFTOTEX_PASSWORD: 'test' } });
    assert.ok(existsSync(join(encrypted, 'document.tex')));
    assert.throws(() => execFileSync(binary, ['scripts/fixtures/password-test.pdf', '-o', join(directory, 'wrong-password')], { stdio: 'pipe', env: { ...process.env, PDFTOTEX_PASSWORD: 'wrong' } }));
    assert.throws(() => execFileSync(binary, [pdf, '-o', join(directory, 'bad'), '--pages', '1-999999'], { stdio: 'pipe' }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

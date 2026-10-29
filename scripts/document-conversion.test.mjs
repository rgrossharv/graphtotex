import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { initSync, convert_document_bytes } from '../public/vendor/pdf-to-tex/graphtotex_pdf_core.js';
import { docxFixture, epubFixture } from './document-fixtures.mjs';
initSync({ module: await readFile('public/vendor/pdf-to-tex/graphtotex_pdf_core_bg.wasm') });
const convert = (bytes, kind) => JSON.parse(convert_document_bytes(bytes, kind));
test('DOCX preserves headings, bold, OMML fractions, consecutive numbered items, and tables', () => {
  const result=convert(docxFixture(),'docx');
  assert.match(result.tex,/\\section\*\{Algebra notes\}/);
  assert.match(result.tex,/\\textbf\{100\\% safe\\_text\}/);
  assert.match(result.tex,/\\frac\{x\}\{2\}/);
  assert.equal((result.tex.match(/\\begin\{enumerate\}/g)||[]).length,1);
  assert.equal((result.tex.match(/\\item /g)||[]).length,2);
  assert.match(result.tex,/\\begin\{longtable\}/);assert.equal(result.equations,1);
});
test('EPUB follows the spine rather than ZIP/filename order and retains MathML', () => {
  const result=convert(epubFixture(),'epub');
  assert.ok(result.tex.indexOf('First chapter')<result.tex.indexOf('Second chapter'));
  assert.match(result.tex,/\\frac\{x\}\{2\}/);assert.equal(result.equations,1);
});
test('untrusted XML, ZIP paths, scripts, and unsupported legacy formats are handled explicitly', () => {
  assert.throws(()=>convert(zipSync({'../bad':strToU8('bad')}),'docx'));
  assert.throws(()=>convert(zipSync({'META-INF/encryption.xml':strToU8('<encryption/>')}),'epub'));
  const math=convert(strToU8('<math><mfrac>\n <mi>x</mi>\n <mn>2</mn>\n</mfrac></math>'),'html');
  assert.match(math.tex,/\\frac\{x\}\{2\}/);
  const result=convert(strToU8('<p>\\input{bad} &amp; 10%</p><script>alert(1)</script>'),'html');
  assert.match(result.tex,/\\textbackslash\{\}input\\\{bad\\\}/);assert.doesNotMatch(result.tex,/alert\(1\)/);
  assert.throws(()=>convert(strToU8('old'),'doc'),/docx/);
});

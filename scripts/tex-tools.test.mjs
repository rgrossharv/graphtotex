import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';

const { code } = await transformWithEsbuild(await readFile('src/lib/texHtml.ts', 'utf8'), 'texHtml.ts');
const { createSlideHtml } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('HTML slide downloads embed pages and page text and work without external resources', () => {
  const html = createSlideHtml([{ image: 'data:image/png;base64,AA==', text: 'First slide' }, { image: 'data:image/png;base64,AQ==', text: 'Second slide' }], 'My slides');
  assert.match(html, /<title>My slides<\/title>/);
  assert.equal((html.match(/<section class="slide/g) || []).length, 2);
  assert.match(html, /aria-label="Slide 2 of 2" hidden/);
  assert.match(html, /data:image\/png;base64,AA==/);
  assert.match(html, /class="sr-only">Second slide/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=/);
  assert.match(html, /ArrowRight/);
  assert.match(html, /@media print/);
  assert.match(html, /aria-pressed="false">All pages/);
});

test('document titles and page text are escaped before embedding in downloadable HTML', () => {
  const html = createSlideHtml([{ image: 'data:image/png;base64,AA==', text: '<script>alert(1)</script> & math' }], '</title><script>alert(2)</script>');
  assert.doesNotMatch(html, /<script>alert\([12]\)/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; math/);
  assert.match(html, /default-src 'none'/);
});

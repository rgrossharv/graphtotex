import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { unzipSync, strFromU8 } from 'fflate';
import { fixturePdf, imagePdf } from './pdf-fixtures.mjs';
import { docxFixture, epubFixture } from './document-fixtures.mjs';

// Run against a production build, or set PDFTOTEX_TEST_URL to an existing server.
const server = process.env.PDFTOTEX_TEST_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 4179, strictPort: true } });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
try {
  await page.goto(`${process.env.PDFTOTEX_TEST_URL || 'http://127.0.0.1:4179'}/misc/`);
  await page.getByRole('button', { name: 'PDF → TeX', exact: true }).click();
  const upload = page.getByLabel('Choose PDF to convert to LaTeX');
  const source = page.getByLabel('Reconstructed LaTeX source');
  const wait = async () => {
    await page.getByText(/^Converted \d+ pages in/).or(page.getByRole('alert')).waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('alert').count(), 0, (await page.getByRole('alert').allTextContents()).join('\n'));
  };
  await upload.setInputFiles({ name: 'mixed.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixturePdf()) });
  await wait();
  assert.match(await source.inputValue(), /Hello world/);
  assert.match(await source.inputValue(), /\\includepdf\[pages=\{2\}/);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP project' }).click();
  const archive = unzipSync(new Uint8Array(await readFile(await (await downloaded).path())));
  assert.ok(archive['source.pdf']); assert.ok(archive['document.tex']);
  assert.deepEqual(JSON.parse(strFromU8(archive['report.json'])).pages.map(p => p.preserved), [false, true, true]);

  await page.getByLabel('Conversion mode').selectOption('editable');
  await page.getByLabel('Pages', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Convert PDF', exact: true }).click(); await wait();
  assert.doesNotMatch(await source.inputValue(), /\\includepdf\[/);

  await page.getByLabel('Pages', { exact: true }).fill('1-999999');
  await page.getByRole('button', { name: 'Convert PDF', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Choose pages between' }).waitFor();
  await page.getByLabel('Pages', { exact: true }).fill('');

  // Exercise actual drag-and-drop, including an image-only PDF.
  await page.getByLabel('Conversion mode').selectOption('auto');
  await page.locator('.pdf-tex-drop').evaluate((element, bytes) => {
    const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], 'scan.pdf', { type: 'application/pdf' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  }, [...imagePdf()]);
  await wait(); assert.match(await source.inputValue(), /\\includepdf/);

  await page.getByLabel('Conversion mode').selectOption('visual');
  await page.getByRole('button', { name: 'Convert PDF', exact: true }).click(); await wait();
  assert.match(await source.inputValue(), /\\includepdf/);
  await page.getByLabel('Conversion mode').selectOption('auto');

  await upload.setInputFiles({ name: 'protected.pdf', mimeType: 'application/pdf', buffer: await readFile('scripts/fixtures/password-test.pdf') });
  await page.getByLabel('PDF password').waitFor(); await page.getByLabel('PDF password').fill('test');
  await page.getByRole('button', { name: 'Convert PDF', exact: true }).click(); await wait();
  const protectedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP project' }).click();
  const protectedFiles = unzipSync(new Uint8Array(await readFile(await (await protectedDownload).path())));
  assert.ok(Object.keys(protectedFiles).some(name => name.endsWith('.png')));
  assert.equal(protectedFiles['source.pdf'], undefined);

  await upload.setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await page.getByRole('alert').filter({ hasText: 'PDF header' }).waitFor();
  // Cancellation terminates parsing, including child workers, without stale output.
  const large = fixturePdf(Array.from({ length: 400 }, () => 'BT /F1 11 Tf 40 700 Td (Worker cancellation test) Tj ET'));
  await upload.setInputFiles({ name: 'long.pdf', mimeType: 'application/pdf', buffer: Buffer.from(large) });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByText('Conversion cancelled.', { exact: true }).waitFor();
  await page.waitForTimeout(250);
  assert.equal(await source.count(), 0);

  // Repeatable synthetic throughput check. Do not assert a machine-specific
  // timing budget, but exercise a substantial text document in the real worker.
  const textPage = Array.from({ length: 40 }, (_, i) => `BT /F1 11 Tf 40 ${740 - i * 16} Td (Line ${i}: A sample paragraph for throughput measurement.) Tj ET`).join('\n');
  await upload.setInputFiles({ name: '100-pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixturePdf(Array(100).fill(textPage))) });
  await wait();
  assert.ok((await source.inputValue()).includes('% Page 100:'));
  console.log('Synthetic 100-page browser check:', await page.getByText(/^Converted \d+ pages in/).textContent());

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mkdir('.tools/qa', { recursive: true });
  await page.screenshot({ path: '.tools/qa/pdf-to-tex-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 860 });
  await upload.setInputFiles({ name: 'mixed.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixturePdf()) }); await wait();
  await page.screenshot({ path: '.tools/qa/pdf-to-tex-desktop.png', fullPage: true });
  await upload.setInputFiles({name:'notes.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(docxFixture())});
  await page.getByText(/^Converted DOCX/).waitFor();
  assert.match(await source.inputValue(),/\\frac\{x\}\{2\}/);
  assert.match(await source.inputValue(),/\\begin\{enumerate\}/);
  await upload.setInputFiles({name:'book.epub',mimeType:'application/epub+zip',buffer:Buffer.from(epubFixture())});
  await page.getByText(/^Converted EPUB/).waitFor();
  assert.ok((await source.inputValue()).indexOf('First chapter')<(await source.inputValue()).indexOf('Second chapter'));
  for (const [name, data] of Object.entries(archive)) await writeFile(`.tools/qa/${name}`, data);
  assert.deepEqual(errors, []);
  console.log('Browser QA passed: real WASM, nested PDF.js worker, drag/drop, ZIP assets, page ranges, password, invalid PDF, cancellation, mobile layout.');
} catch (error) {
  console.error(await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
}

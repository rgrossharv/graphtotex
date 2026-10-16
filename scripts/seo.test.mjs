import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';

const source = await readFile('src/lib/pages.ts', 'utf8');
const { code } = await transformWithEsbuild(source, 'pages.ts');
const { EXPORT_GUIDE_PATH, pageFromLocation, PAGES, canonicalUrl } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('clean paths and existing hash bookmarks select the right workspace', () => {
  for (const [url, expected] of [
    ['/', '2d'], ['/index.html', '2d'], ['/#2d', '2d'],
    ['/3d', '3d'], ['/3d/', '3d'], ['/3d/index.html', '3d'], ['/#3d', '3d'],
    ['/diagram', 'diagram'], ['/diagram/', 'diagram'], ['/diagram/index.html', 'diagram'], ['/#diagram', 'diagram'],
    ['/misc', 'misc'], ['/misc/', 'misc'], ['/misc/index.html', 'misc'], ['/#misc', 'misc'],
    ['/3d/#diagram', 'diagram'], ['/diagram/#3d', '3d'], ['/diagram/#2d', '2d'],
    ['/diagram/#unrelated', 'diagram'], ['/?source=bookmark#diagram', 'diagram']
  ]) {
    assert.equal(pageFromLocation(new URL(url, 'https://graphtotex.com')), expected, url);
  }
});

const expectedContent = {
  '2d': ['Expressions', 'Export TikZ', 'Implicit', 'implicit equations', 'sin(x)', 'Visible expressions:'],
  '3d': ['Surfaces', 'Export TikZ 3D', 'PGFPlots', 'Visible surfaces:'],
  diagram: ['Commutative diagram', 'Export TikZ-CD', 'Commutative triangle', 'Exact sequence', 'From objects to arrows.'],
  misc: ['Misc calculator', 'Scientific', 'Calculus', 'Linear algebra', 'TeX input', 'TeX → PDF', 'TeX → HTML']
};

for (const [page, metadata] of Object.entries(PAGES)) {
  test(`${metadata.path} ships crawlable HTML and workspace-specific metadata`, async () => {
    const html = await readFile(resolve('dist', `.${metadata.path}`, 'index.html'), 'utf8');
    assert.match(html, /<div id="root"><div class="app-shell">/);
    assert.match(html, /<h1>GraphToTeX<\/h1>/);
    assert.match(html, /class="software-license"[^>]*>Public domain software<\/a>/);
    assert.equal((html.match(/<title>/g) || []).length, 1);
    assert.ok(html.includes(`<title>${metadata.title.replace(/&/g, '&amp;')}</title>`));
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.ok(html.includes(`<link rel="canonical" href="${canonicalUrl(page)}"`));
    assert.ok(html.includes(`<meta property="og:url" content="${canonicalUrl(page)}"`));
    assert.ok(html.includes(`<meta name="description" content="${metadata.description}"`));
    assert.doesNotMatch(html, /noindex|seo-head-start|\/src\/main\.tsx/);

    const schema = JSON.parse(html.match(/<script id="page-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema['@graph'].find((entry) => entry['@type'] === 'WebApplication').url, canonicalUrl(page));
    for (const text of expectedContent[page]) assert.ok(html.includes(text), text);
    for (const { path } of Object.values(PAGES)) assert.ok(html.includes(`href="${path}"`), `link to ${path}`);

    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)];
    assert.ok(assets.some(([, path]) => path.endsWith('.js')), 'interactive application script');
    assert.ok(assets.some(([, path]) => path.endsWith('.css')), 'application styles');
    for (const [, path] of assets) await access(`dist${path}`);
  });
}

test('the Desmos to TikZ guide has readable content, metadata, and workspace links without JavaScript', async () => {
  const html = await readFile(resolve('dist', `.${EXPORT_GUIDE_PATH}`, 'index.html'), 'utf8');
  assert.match(html, /<h1>Desmos to TikZ: export graphs to LaTeX<\/h1>/);
  assert.match(html, /<title>Desmos to TikZ: Export Graphs to LaTeX \| GraphToTeX<\/title>/);
  assert.ok(html.includes(`rel="canonical" href="https://graphtotex.com${EXPORT_GUIDE_PATH}"`));
  assert.match(html, /does not import Desmos share links/);
  assert.doesNotMatch(html, /noindex|<script[^>]+src=/);
  for (const { path } of Object.values(PAGES)) assert.ok(html.includes(`href="${path}"`));
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema['@type'], 'TechArticle');
  assert.equal(schema.url, `https://graphtotex.com${EXPORT_GUIDE_PATH}`);
  for (const { path } of Object.values(PAGES)) {
    const workspace = await readFile(resolve('dist', `.${path}`, 'index.html'), 'utf8');
    assert.ok(workspace.includes(`href="${EXPORT_GUIDE_PATH}"`));
  }
});

test('the deployment includes the sitemap, robots policy, and Pages configuration', async () => {
  const sitemap = await readFile('dist/sitemap.xml', 'utf8');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url);
  assert.deepEqual(urls.sort(), [...Object.keys(PAGES).map(canonicalUrl), `https://graphtotex.com${EXPORT_GUIDE_PATH}`].sort());
  const robots = await readFile('dist/robots.txt', 'utf8');
  assert.match(robots, /Allow: \/\s/);
  assert.match(robots, /Sitemap: https:\/\/graphtotex\.com\/sitemap\.xml/);
  assert.equal((await readFile('dist/CNAME', 'utf8')).trim(), 'graphtotex.com');
  await access('dist/.nojekyll');
  for (const { path } of Object.values(PAGES)) {
    const html = await readFile(resolve('dist', `.${path}`, 'index.html'), 'utf8');
    assert.match(html, /<link rel="icon" href="data:,"\s*\/>/);
    assert.doesNotMatch(html, /href="\/favicon/);
  }
  await access('dist/tikz-preview.html');
  await access('dist/tikz-preview.js');
});

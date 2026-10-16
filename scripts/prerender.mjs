import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// Render the actual React interface at build time. GitHub Pages can then serve
// every workspace directly without a server, SPA fallback, or bot detection.
const temporaryDirectory = await mkdtemp(resolve('node_modules/.graphtotex-prerender-'));

try {
  await build({
    logLevel: 'warn',
    build: {
      ssr: 'src/entry-server.tsx',
      outDir: temporaryDirectory,
      rollupOptions: { output: { entryFileNames: 'entry-server.mjs' } }
    }
  });
  const { PAGES, renderPage } = await import(pathToFileURL(resolve(temporaryDirectory, 'entry-server.mjs')));
  const template = await readFile('dist/index.html', 'utf8');
  if (!template.includes('<!--seo-head-start-->') || !template.includes('<div id="root"></div>')) {
    throw new Error('The HTML template is missing its prerender placeholders.');
  }

  for (const [page, metadata] of Object.entries(PAGES)) {
    const { head, html } = renderPage(page);
    const document = template
      .replace(/<!--seo-head-start-->[\s\S]*?<!--seo-head-end-->/, head)
      .replace('<div id="root"></div>', () => `<div id="root">${html}</div>`);
    const directory = resolve('dist', `.${metadata.path}`);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'index.html'), document);
    console.log(`Prerendered ${metadata.path}`);
  }

  const urls = Object.values(PAGES).map(({ path }) => `  <url><loc>https://graphtotex.com${path}</loc></url>`);
  await writeFile('dist/sitemap.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>\n'
  ].join('\n'));
  await copyFile('robots.txt', 'dist/robots.txt');
  await copyFile('CNAME', 'dist/CNAME');
  await writeFile('dist/.nojekyll', '');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

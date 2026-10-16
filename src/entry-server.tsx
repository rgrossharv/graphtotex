import { renderToString } from 'react-dom/server';
import App from './App';
import { canonicalUrl, PAGES, structuredData, type Page } from './lib/pages';

export { EXPORT_GUIDE_PATH, PAGES } from './lib/pages';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]!);

export function renderPage(page: Page) {
  const metadata = PAGES[page];
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const url = canonicalUrl(page);
  return {
    html: renderToString(<App initialPage={page} />),
    head: [
      `<title>${title}</title>`,
      `<meta name="description" content="${description}" />`,
      `<link rel="canonical" href="${url}" />`,
      '<meta property="og:type" content="website" />',
      '<meta property="og:site_name" content="GraphToTeX" />',
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${description}" />`,
      `<meta property="og:url" content="${url}" />`,
      '<meta name="twitter:card" content="summary" />',
      `<meta name="twitter:title" content="${title}" />`,
      `<meta name="twitter:description" content="${description}" />`,
      `<script id="page-schema" type="application/ld+json">${JSON.stringify(structuredData(page)).replace(/</g, '\\u003c')}</script>`
    ].join('\n    ')
  };
}

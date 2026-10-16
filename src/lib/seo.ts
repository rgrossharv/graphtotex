import { canonicalUrl, PAGES, structuredData, type Page } from './pages';

export function updatePageMetadata(page: Page) {
  const metadata = PAGES[page];
  document.title = metadata.title;

  const tags = [
    ['name', 'description', metadata.description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'GraphToTeX'],
    ['property', 'og:title', metadata.title],
    ['property', 'og:description', metadata.description],
    ['property', 'og:url', canonicalUrl(page)],
    ['name', 'twitter:card', 'summary'],
    ['name', 'twitter:title', metadata.title],
    ['name', 'twitter:description', metadata.description]
  ];
  for (const [attribute, key, content] of tags) {
    let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attribute, key);
      document.head.appendChild(tag);
    }
    tag.content = content;
  }

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl(page);

  let schema = document.getElementById('page-schema');
  if (!schema) {
    schema = document.createElement('script');
    schema.id = 'page-schema';
    schema.setAttribute('type', 'application/ld+json');
    document.head.appendChild(schema);
  }
  schema.textContent = JSON.stringify(structuredData(page));
}

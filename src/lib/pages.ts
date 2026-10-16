export type Page = '2d' | '3d' | 'diagram';

export const SITE_URL = 'https://graphtotex.com';

export const PAGES: Record<Page, {
  path: string;
  label: string;
  title: string;
  description: string;
  features: string[];
}> = {
  '2d': {
    path: '/',
    label: '2d',
    title: 'GraphToTeX | Online Graphing Calculator with TikZ Export',
    description: 'Plot functions and implicit equations with GraphToTeX, a free online 2D graphing calculator. Customize your graphs and export TikZ code for LaTeX.',
    features: ['2D function plotting', 'Implicit equations', 'Custom domains and graph styles', 'TikZ export for LaTeX']
  },
  '3d': {
    path: '/3d/',
    label: '3d',
    title: '3D Graphing Calculator with LaTeX Export | GraphToTeX',
    description: 'Plot and rotate 3D surfaces online with GraphToTeX. Adjust colors, domains, and axis bounds, then export PGFPlots code for your LaTeX document.',
    features: ['3D surface plotting', 'Interactive rotation and zoom', 'Custom surface domains and colors', 'PGFPlots export for LaTeX']
  },
  diagram: {
    path: '/diagram/',
    label: 'Diagrams',
    title: 'Commutative Diagram Editor with TikZ-CD Export | GraphToTeX',
    description: 'Create commutative diagrams online with LaTeX labels and editable arrows. Start from a square, triangle, or exact sequence and export TikZ or TikZ-CD.',
    features: ['Commutative diagram editor', 'LaTeX object and arrow labels', 'Square, triangle, and exact sequence templates', 'TikZ and TikZ-CD export']
  }
};

export function pageFromLocation(location: Pick<Location, 'pathname' | 'hash'>): Page {
  // Legacy fragments take precedence, including fragments added on a workspace URL.
  if (location.hash === '#2d' || location.hash === '#3d' || location.hash === '#diagram') {
    return location.hash.slice(1) as Page;
  }
  const path = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
  return path === '/diagram' ? 'diagram' : path === '/3d' ? '3d' : '2d';
}

export function canonicalUrl(page: Page): string {
  return `${SITE_URL}${PAGES[page].path}`;
}

export function structuredData(page: Page) {
  const metadata = PAGES[page];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'GraphToTeX',
        inLanguage: 'en'
      },
      {
        '@type': 'WebApplication',
        '@id': `${canonicalUrl(page)}#application`,
        url: canonicalUrl(page),
        name: metadata.title,
        description: metadata.description,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and a modern web browser.',
        isAccessibleForFree: true,
        inLanguage: 'en',
        featureList: metadata.features,
        isPartOf: { '@id': `${SITE_URL}/#website` }
      }
    ]
  };
}

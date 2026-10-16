export type Page = '2d' | '3d' | 'diagram' | 'misc';

export const SITE_URL = 'https://graphtotex.com';
export const EXPORT_GUIDE_PATH = '/desmos-to-tikz/';

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
    title: 'GraphToTeX | Desmos-style Graphing with TikZ Export',
    description: 'A free Desmos-style graphing calculator with TikZ export. Plot functions and implicit equations, preview your LaTeX figure, and download .tex code.',
    features: ['2D function plotting', 'Implicit equations', 'Custom domains and graph styles', 'TikZ export for LaTeX', 'Compiled LaTeX figure preview']
  },
  '3d': {
    path: '/3d/',
    label: '3d',
    title: '3D Graphing Calculator with LaTeX Export | GraphToTeX',
    description: 'Plot and rotate 3D surfaces online with GraphToTeX. Adjust colors, domains, and axis bounds, then export PGFPlots code for your LaTeX document.',
    features: ['3D surface plotting', 'Interactive rotation and zoom', 'Custom surface domains and colors', 'PGFPlots export for LaTeX', 'Compiled LaTeX figure preview']
  },
  diagram: {
    path: '/diagram/',
    label: 'Diagrams',
    title: 'Commutative Diagram Editor with TikZ-CD Export | GraphToTeX',
    description: 'Create commutative diagrams online with LaTeX labels and editable arrows. Start from a square, triangle, or exact sequence and export TikZ or TikZ-CD.',
    features: ['Commutative diagram editor', 'LaTeX object and arrow labels', 'Square, triangle, and exact sequence templates', 'TikZ and TikZ-CD export']
  },
  misc: {
    path: '/misc/',
    label: 'Misc',
    title: 'TeX Calculator, Calculus & Matrix Tools | GraphToTeX',
    description: 'Calculate derivatives, integrals, and matrices from TeX, or graph complex functions. Export LaTeX, compile TeX to PDF, and convert Beamer slides to HTML.',
    features: ['Scientific calculator with TeX export', 'Derivatives, integrals, and multivariable calculus', 'Matrices and linear algebra', 'Complex function graphing with domain coloring', 'TeX autocomplete and live math preview', 'TeX to PDF and HTML tools']
  }
};

export function pageFromLocation(location: Pick<Location, 'pathname' | 'hash'>): Page {
  // Legacy fragments take precedence, including fragments added on a workspace URL.
  if (location.hash === '#2d' || location.hash === '#3d' || location.hash === '#diagram' || location.hash === '#misc') {
    return location.hash.slice(1) as Page;
  }
  const path = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
  return path === '/misc' ? 'misc' : path === '/diagram' ? 'diagram' : path === '/3d' ? '3d' : '2d';
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

type IconName = 'plus' | 'minus' | 'settings' | 'close' | 'collapse' | 'expand' | 'home' | 'export' | 'up' | 'down';

const paths: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  settings: 'M4 7h16M4 17h16M9 4v6M15 14v6',
  close: 'm6 6 12 12M6 18 18 6',
  collapse: 'm11 6-6 6 6 6m7-12-6 6 6 6',
  expand: 'm6 6 6 6-6 6m7-12 6 6-6 6',
  home: 'm3 10 9-7 9 7M6 8v12h12V8M10 20v-7h4v7',
  export: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6'
};

export default function GraphIcon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}

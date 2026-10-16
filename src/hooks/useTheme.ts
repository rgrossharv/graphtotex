import { useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'graphtotex-theme';

export function useTheme() {
  const preference = useRef<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  );

  const applyTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    try { preference.current = localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    const sync = () => applyTheme(preference.current === 'light' || preference.current === 'dark' ? preference.current : media.matches ? 'dark' : 'light');
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        preference.current = event.newValue;
        sync();
      }
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    preference.current = next;
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the toggle usable without storage. */ }
  };

  return { theme, toggleTheme };
}

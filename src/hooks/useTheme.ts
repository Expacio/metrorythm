import { useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';

export type Theme = 'light' | 'dark';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>(
    'metrogo.theme',
    systemPrefersDark() ? 'dark' : 'light',
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, setTheme, toggle };
}

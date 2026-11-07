import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyTheme, preferredTheme, savedTheme, THEME_STORAGE_KEY } from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || preferredTheme());
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setTheme(applyTheme(preferredTheme(), { persist: false }));
    const systemChanged = () => { if (!savedTheme()) sync(); };
    const storageChanged = (event) => { if (!event.key || event.key === THEME_STORAGE_KEY) sync(); };
    media.addEventListener('change', systemChanged);
    window.addEventListener('storage', storageChanged);
    return () => {
      media.removeEventListener('change', systemChanged);
      window.removeEventListener('storage', storageChanged);
    };
  }, []);
  const dark = theme === 'dark';
  const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
  return <Button className="theme-toggle" variant="outline" size="sm" aria-label={label} title={label} onClick={() => setTheme(applyTheme(dark ? 'light' : 'dark'))}>
    {dark ? <Sun size={15} /> : <Moon size={15} />}<span>{dark ? 'Light' : 'Dark'}</span>
  </Button>;
}

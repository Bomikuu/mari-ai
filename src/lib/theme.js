export const THEME_STORAGE_KEY = 'mari.theme';

export function savedTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch { return null; }
}

export function preferredTheme() {
  return savedTheme() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function applyTheme(theme, { persist = true } = {}) {
  const resolved = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0a0d18' : '#f6f6f6');
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, resolved); } catch { /* The current tab can still switch when storage is unavailable. */ }
  }
  return resolved;
}

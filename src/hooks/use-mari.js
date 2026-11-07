import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '@/lib/api';
import { disconnectedExecutionView } from '@/lib/connection-state';

const empty = { projects: [], services: [], tasks: [], jobs: [], agents: [], agentProfiles: [], workers: [], artifacts: [], requests: [], events: [], capabilities: {}, projectScans: { roots: [], recentScans: [] } };

export function useMari() {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [paired, setPaired] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const sessionAttempted = useRef(false);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await request('/bootstrap');
      setData({ ...empty, ...next }); setPaired(true); setLoading(false);
    } catch (err) {
      if (err.status === 401) setPaired(false);
      else { setError(err.message); setData((previous) => disconnectedExecutionView(previous)); }
      setLoading(false);
    } finally { refreshing.current = false; }
  }, []);

  const pair = useCallback(async (accessKey) => {
    setBusy('pair'); setError('');
    try {
      await request('/session', { method: 'POST', body: { accessKey } });
      const url = new URL(window.location.href); url.searchParams.delete('access');
      const hash = new URLSearchParams(url.hash.slice(1)); hash.delete('accessKey'); hash.delete('access');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${hash.size ? `#${hash}` : ''}`);
      await refresh();
    } catch (err) { setError(err.message); setPaired(false); setLoading(false); throw err; }
    finally { setBusy(''); }
  }, [refresh]);

  useEffect(() => {
    if (sessionAttempted.current) return;
    sessionAttempted.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const key = hash.get('accessKey') || hash.get('access') || new URLSearchParams(window.location.search).get('access');
    (key ? pair(key) : refresh()).catch(() => {});
  }, [pair, refresh]);

  useEffect(() => {
    if (!paired) return;
    const timer = window.setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [paired, refresh]);

  const mutate = useCallback(async (path, body, method = 'POST') => {
    setBusy(path); setError('');
    try {
      const result = await request(path, { method, body, headers: { 'x-mari-csrf': data.csrfToken || '' } });
      await refresh(); return result;
    } catch (err) { setError(err.message); throw err; }
    finally { setBusy(''); }
  }, [data.csrfToken, refresh]);

  return { data, loading, paired, error, busy, pair, mutate, refresh, clearError: () => setError('') };
}

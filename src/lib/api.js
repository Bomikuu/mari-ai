export async function request(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin', ...options,
    headers: { ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body && !isForm && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = body.code;
    error.details = body.details;
    throw error;
  }
  return body;
}

export const artifactUrl = (artifact) => artifact?.url || `/api/artifacts/${artifact?.id}/content`;
export const human = (value = 'unknown') => String(value).replaceAll('_', ' ').replaceAll('.', ' ');
export function elapsed(value, end = Date.now()) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
}
export function time(value) {
  return value ? new Date(value).toLocaleTimeString([], { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

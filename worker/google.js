import { CodexClient } from './codex.js';
import { now } from '../server/store.js';
import { GOOGLE_TIME_ZONE, googleDate } from '../server/google.js';

// Native protocol metadata was verified against codex-cli 0.160.0. These are
// connector names, not credentials. Discover current enabled/callable state.
const APP_NAMES = { gmail: /^gmail$/i, calendar: /^google calendar$/i };
const READ_TOOLS = new Set(['gmail.search_emails', 'gmail.list_labels', 'google_calendar.search_events']);
const SAFE_ERROR = 'Google could not return this data. Check the connected app in Codex and retry.';
const cancellation = () => Object.assign(new Error('Google refresh cancelled.'), { cancelled: true });
const clean = (value, max = 300) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseGoogleToolResult(result) {
  if (result?.isError) throw new Error(SAFE_ERROR);
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const texts = (result?.content || []).filter((part) => part.type === 'text').map((part) => part.text || '');
  for (const text of texts) {
    if (text.length > 5 * 1024 * 1024) throw new Error('Google response exceeded the safe size limit.');
    try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { /* Other content blocks may contain the JSON result. */ }
  }
  throw new Error('Google returned an unsupported response. No empty result was assumed.');
}

function findList(value, keys, depth = 0) {
  if (Array.isArray(value)) return { items: value, parent: {} };
  if (!value || typeof value !== 'object' || depth > 4) return null;
  for (const key of keys) if (Array.isArray(value[key])) return { items: value[key], parent: value };
  for (const key of ['data', 'result', 'results', 'response']) {
    const found = findList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function headersFor(message) {
  const headers = message.payload?.headers || message.headers || [];
  return Array.isArray(headers) ? Object.fromEntries(headers.map((header) => [String(header.name).toLowerCase(), header.value])) : Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function mimePreview(part, depth = 0) {
  if (!part || depth > 8) return '';
  const mime = part.mime_type || part.mimeType || '';
  if (/^text\/plain/.test(mime)) {
    if (typeof part.content === 'string') return part.content;
    const encoded = part.base64_url_content || part.body?.data;
    if (typeof encoded === 'string') return Buffer.from(encoded.slice(0, 16000), 'base64url').toString('utf8');
  }
  for (const child of part.parts || part.children || []) { const text = mimePreview(child, depth + 1); if (text) return text; }
  return '';
}

function isoTime(value) {
  if (!value) return null;
  const numeric = /^\d{10,13}$/.test(String(value));
  const date = new Date(numeric ? Number(value) * (String(value).length === 10 ? 1000 : 1) : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mailUrl(value, sourceId) {
  try { const url = new URL(value); if (url.protocol === 'https:' && url.hostname === 'mail.google.com' && url.pathname.startsWith('/mail/') && !url.username && !url.password) return url.href; } catch { /* Construct a Gmail source link when no native link is provided. */ }
  return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(sourceId)}`;
}

export function normalizeGoogleMail(data, labelsData) {
  const found = findList(data, ['emails', 'messages', 'items', 'results']);
  if (!found) throw new Error('Google returned an unsupported email list.');
  const labels = findList(labelsData, ['labels', 'items', 'results']);
  const inbox = labels?.items.find((label) => label.id === 'INBOX' || label.name === 'INBOX');
  const count = inbox?.messagesUnread ?? inbox?.messages_unread ?? inbox?.unread_count;
  const unreadCount = Number.isSafeInteger(count) && count >= 0 ? count : null;
  const items = found.items.slice(0, 20).map((message) => {
    const headers = headersFor(message);
    const id = clean(message.id || message.message_id || message.messageId, 256);
    if (!id) throw new Error('An email did not include its source ID.');
    const sender = message.from || message.from_ || message.sender || headers.from;
    const from = typeof sender === 'object' ? [sender.name, sender.email || sender.address].filter(Boolean).join(' ') : sender;
    return { id, subject: clean(message.subject || headers.subject || '(No subject)', 300), from: clean(from, 200), snippet: clean(message.snippet || message.preview || mimePreview(message.payload || message), 300), receivedAt: isoTime(message.internalDate || message.email_ts || message.received_at || message.receivedAt || message.date || headers.date), url: mailUrl(message.display_url || message.url, clean(message.threadId || message.thread_id || id, 256)) };
  });
  return { status: 'ready', items, unreadCount, truncated: Boolean(found.parent.nextPageToken || found.parent.next_page_token || found.items.length > 20 || unreadCount !== null && unreadCount > items.length) };
}

function eventUrl(value, id) {
  try { const url = new URL(value); if (url.protocol === 'https:' && ['calendar.google.com', 'www.google.com'].includes(url.hostname) && !url.username && !url.password) return url.href; } catch { /* Construct a Google Calendar source link. */ }
  return `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(id)}`;
}

export function normalizeGoogleCalendar(data) {
  const found = findList(data, ['events', 'items', 'results']);
  if (!found) throw new Error('Google returned an unsupported calendar list.');
  const events = found.items.filter((event) => event.status !== 'cancelled').slice(0, 30).map((event) => {
    const id = clean(event.id || event.event_id, 256);
    if (!id) throw new Error('A calendar event did not include its source ID.');
    const start = typeof event.start === 'object' ? event.start.dateTime || event.start.date : event.start || event.start_time || event.start_date;
    const end = typeof event.end === 'object' ? event.end.dateTime || event.end.date : event.end || event.end_time || event.end_date;
    if (!start || !end) throw new Error('A calendar event did not include its time bounds.');
    return { id, title: clean(event.summary || event.title || '(Untitled event)', 300), start: clean(start, 80), end: clean(end, 80), allDay: Boolean(event.start?.date || event.all_day || event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(start)), url: eventUrl(event.htmlLink || event.html_link || event.display_url || event.url, id) };
  });
  return { status: 'ready', events, truncated: Boolean(found.parent.nextPageToken || found.parent.next_page_token || found.items.length > 30) };
}

function summaryFor(mail, calendar) {
  const mailText = mail.status === 'ready' ? mail.unreadCount !== null ? `${mail.unreadCount} unread emails in your inbox` : `${mail.items.length}${mail.truncated ? '+' : ''} unread emails shown` : 'Email unavailable';
  const eventsText = calendar.status === 'ready' ? `${calendar.events.length}${calendar.truncated ? '+' : ''} calendar events for this day` : 'Calendar unavailable';
  return `${mailText}. ${eventsText}.`;
}

function cachedFailure(previous, provider, empty) {
  const source = previous?.[provider] || empty;
  const wasFresh = source.status === 'ready' && source.stale !== true;
  // A successful refresh of the other provider only dates that new data.
  // Keep this provider's original provenance through repeated partial failures.
  return {
    ...source,
    status: 'error',
    stale: true,
    cachedAt: Object.hasOwn(source, 'cachedAt') ? source.cachedAt : wasFresh ? previous?.generatedAt || null : null,
    sourceDate: Object.hasOwn(source, 'sourceDate') ? source.sourceDate : wasFresh ? previous?.date || null : null,
    error: SAFE_ERROR,
  };
}

export async function runGoogleBrief({ store, dataDir, job, signal, makeCodex = (options) => new CodexClient(options) }) {
  if (signal?.aborted) throw cancellation();
  const inspecting = job.type === 'personal.google.inspect';
  const date = googleDate(job.payload?.date, job.payload?.timeZone || GOOGLE_TIME_ZONE);
  const cached = store.get('settings', 'google-brief');
  if (!inspecting && cached) store.put('settings', { ...cached, stale: true, refreshing: true, lastAttemptAt: now() });
  const activity = (action, tool = null) => {
    if (job.agentId) store.update('agents', job.agentId, { name: 'Google reader', role: 'personal summaries', status: 'working', phase: 'google-brief', action, currentCommand: tool, lastActivityAt: now() });
  };
  const event = (type, message, data = {}) => store.event({ source: 'agent', agentId: job.agentId, type, message, data });
  // Suppress raw protocol diagnostics/tool arguments/results. Private mailbox
  // content is stored only in the owner-protected brief, never in agent logs.
  const privateStore = { ...store, event() {}, update() { return null; }, put() { return null; } };
  const client = makeCodex({ store: privateStore, agentId: job.agentId, onActivity() {} });
  if (typeof client.send === 'function') client.serverRequest = (message) => client.send({ id: message.id, error: { code: -32601, message: 'Google summaries only authorize explicit read tools; interactive actions are unavailable.' } });
  let timer, abort, stopped = false;
  const ensureActive = () => { if (signal?.aborted || stopped) throw cancellation(); };
  const interrupted = new Promise((_, reject) => {
    abort = () => { stopped = true; reject(cancellation()); Promise.resolve(client.close()).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { stopped = true; reject(new Error('Google refresh exceeded its three-minute limit. Retry explicitly.')); Promise.resolve(client.close()).catch(() => {}); }, 180000);
  });
  let connections;
  try {
    const result = await Promise.race([interrupted, (async () => {
      activity('Checking connected Google apps through native Codex MCP.');
      await client.connect();
      const installed = await client.request('app/installed', { forceRefresh: true }, 45000);
      ensureActive();
      if (!Array.isArray(installed.apps)) throw new Error('Google app availability could not be verified.');
      connections = Object.fromEntries(Object.entries(APP_NAMES).map(([key, pattern]) => {
        const app = installed.apps.find((item) => pattern.test(item.runtimeName || item.name || ''));
        return [key, { status: !app ? 'unavailable' : !app.enabled ? 'disabled' : app.callable ? 'connected' : 'unavailable', callable: Boolean(app?.enabled && app?.callable), lastCheckedAt: now() }];
      }));
      store.put('settings', { id: 'google-connections', connections, error: null });
      event('google.inspected', 'Checked Google app connectivity.', { gmail: connections.gmail.status, calendar: connections.calendar.status });
      if (inspecting) return { connections };
      const listed = await client.request('mcpServerStatus/list', { serverName: 'codex_apps', detail: 'toolsAndAuthOnly', limit: 100 }, 30000);
      const server = listed.data?.find((item) => item.name === 'codex_apps');
      const tools = Object.values(server?.tools || {});
      const thread = await client.request('thread/start', { cwd: dataDir, sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true }, 30000);
      if (!thread.thread?.id) throw new Error('Google read-only MCP session could not start.');
      const call = async (name, args) => {
        ensureActive();
        const tool = tools.find((item) => item.name === name);
        if (!READ_TOOLS.has(name) || !tool || tool.annotations?.destructiveHint === true || tool.annotations?.readOnlyHint === false) throw new Error('The required Google read tool is unavailable.');
        const properties = tool.inputSchema?.properties;
        if (!properties || Object.keys(args).some((key) => !Object.hasOwn(properties, key))) throw new Error('Google tool parameters changed. Refresh the installed connector.');
        activity(`Reading ${name.startsWith('gmail.') ? 'your inbox' : 'your calendar'} through MCP.`, name);
        event('google.tool.started', 'Reading Google data.', { tool: name });
        const response = await client.request('mcpServer/tool/call', { server: 'codex_apps', threadId: thread.thread.id, tool: name, arguments: args }, 30000);
        ensureActive();
        const value = parseGoogleToolResult(response);
        event('google.tool.completed', 'Google read tool completed.', { tool: name });
        return value;
      };
      const previous = cached?.brief;
      let mail, calendar;
      if (connections.gmail.callable) {
        try {
          const data = await call('gmail.search_emails', { query: 'in:inbox is:unread -in:spam -in:trash', max_results: 20 });
          let labels = null;
          try { labels = await call('gmail.list_labels', { label_names: ['INBOX'] }); } catch (error) { ensureActive(); }
          mail = normalizeGoogleMail(data, labels);
        } catch (error) { ensureActive(); mail = cachedFailure(previous, 'mail', { items: [], unreadCount: null, truncated: false }); }
      } else mail = { items: [], unreadCount: null, truncated: false, status: 'unavailable', error: 'Connect Gmail in Codex to read your inbox.' };
      if (connections.calendar.callable) {
        try {
          const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
          const data = await call('google_calendar.search_events', { time_min: `${date}T00:00:00+08:00`, time_max: `${nextDate}T00:00:00+08:00`, timezone_str: GOOGLE_TIME_ZONE, max_results: 30, calendar_id: 'primary' });
          calendar = normalizeGoogleCalendar(data);
        } catch (error) { ensureActive(); calendar = cachedFailure(previous, 'calendar', { events: [], truncated: false }); }
      } else calendar = { events: [], truncated: false, status: 'unavailable', error: 'Connect Google Calendar in Codex to read your day.' };
      if (mail.status !== 'ready' && calendar.status !== 'ready') throw new Error(SAFE_ERROR);
      ensureActive();
      const brief = { generatedAt: now(), date, timeZone: GOOGLE_TIME_ZONE, summary: summaryFor(mail, calendar), mail, calendar, stale: mail.status !== 'ready' || calendar.status !== 'ready' };
      store.put('settings', { id: 'google-brief', brief, stale: brief.stale, refreshing: false, lastAttemptAt: now(), error: null });
      activity('Google summary is ready.');
      event('google.brief.ready', 'Refreshed the Google summary.', { mailItems: mail.status === 'ready' ? mail.items.length : null, calendarItems: calendar.status === 'ready' ? calendar.events.length : null });
      return { connections, brief };
    })()]);
    return result;
  } catch (error) {
    const cancelled = Boolean(signal?.aborted || error.cancelled);
    const message = cancelled ? 'Google refresh cancelled.' : SAFE_ERROR;
    const checked = now();
    if (!connections) store.put('settings', { id: 'google-connections', connections: { gmail: { status: 'error', callable: false, lastCheckedAt: checked }, calendar: { status: 'error', callable: false, lastCheckedAt: checked } }, error: message });
    if (!inspecting) store.put('settings', { ...(cached || { id: 'google-brief', brief: null }), id: 'google-brief', stale: true, refreshing: false, error: message, lastAttemptAt: checked });
    if (cancelled) throw cancellation();
    throw new Error(message);
  } finally {
    stopped = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    await client.close();
  }
}

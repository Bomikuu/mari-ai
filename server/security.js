import fs from 'node:fs';
import path from 'node:path';

const SECRET_NAME = /(?:api.?key|token|secret|password|passwd|credential|authorization|cookie|session|private.?key)/i;
const ENV_BLOCK = /^(?:MARI_|OPENAI_|AZURE_OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|TYPESAFE_|JEV_|AI_GATEWAY_|OPENROUTER_|CLOUDFLARE_API_)/i;
const SAFE_ENV = /^(?:PATH|HOME|USER|LOGNAME|SHELL|LANG|LANGUAGE|LC_[A-Z_]+|TZ|TERM|COLORTERM|TMPDIR|TMP|TEMP|PWD|XDG_CACHE_HOME|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_RUNTIME_DIR|CODEX_HOME|NVM_DIR|NVM_BIN|PNPM_HOME|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/;

export function createRedactor(values = []) {
  const secrets = new Set();
  const add = (items) => {
    const list = Array.isArray(items) ? items : Object.values(items || {});
    for (const item of list) if (typeof item === 'string' && item.length >= 4) secrets.add(item);
  };
  add(values);
  const text = (input) => {
    let result = String(input);
    for (const secret of [...secrets].sort((a, b) => b.length - a.length)) result = result.split(secret).join('[REDACTED]');
    return result
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]')
      .replace(/\b(sk-[A-Za-z0-9_-]{10,})\b/g, '[REDACTED]')
      .replace(/((?:["']?(?:api[_-]?key|access[_-]?key|token|secret|password|passwd|authorization|cookie)["']?)\s*[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi, '$1[REDACTED]')
      .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@');
  };
  const redact = (value) => {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        key === 'actor' && item === 'user' ? 'user' :
          SECRET_NAME.test(key) && !/^(?:tokenUsage|tokens|csrfToken)$/i.test(key) ? '[REDACTED]' : redact(item),
      ]));
    }
    return value;
  };
  return { add, redact };
}

export function safeChildEnv(extra = {}) {
  const result = {};
  for (const [key, value] of Object.entries({ ...process.env, ...extra })) {
    if (value !== undefined && SAFE_ENV.test(key) && !SECRET_NAME.test(key) && !ENV_BLOCK.test(key)) result[key] = String(value);
  }
  return result;
}

export function ensureInside(root, target) {
  const canonicalRoot = fs.realpathSync(root);
  const absolute = path.resolve(target);
  let probe = absolute;
  const missing = [];
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) throw new Error('Path does not have an existing parent.');
    missing.unshift(path.basename(probe));
    probe = parent;
  }
  const resolved = path.resolve(fs.realpathSync(probe), ...missing);
  const relative = path.relative(canonicalRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path is outside the permitted directory.');
  return resolved;
}

export function validateHttpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a complete http:// or https:// URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use HTTP(S) without embedded credentials.');
  url.hash = '';
  return url.toString();
}

export function secretEnvironmentValues(env = process.env) {
  const desktopMetadata = /^(?:XDG_SESSION_(?:CLASS|TYPE|ID|DESKTOP|PATH)|DESKTOP_SESSION|GDMSESSION|GNOME_DESKTOP_SESSION_ID|SESSION_MANAGER|DBUS_SESSION_BUS_ADDRESS)$/;
  return Object.entries(env).filter(([key]) => SECRET_NAME.test(key) && !desktopMetadata.test(key)).map(([, value]) => value).filter(Boolean);
}

// Output is redacted only after a complete line, including secrets split across chunks.
export function createLineWriter(redactor, emit, { maxLength = 65536 } = {}) {
  let pending = '';
  let dropping = false;
  return {
    write(chunk) {
      let input = String(chunk);
      if (dropping) {
        const end = input.indexOf('\n');
        if (end === -1) return;
        input = input.slice(end + 1);
        dropping = false;
      }
      pending += input;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        emit(redactor.redact(pending.slice(0, newline).replace(/\r$/, '')));
        pending = pending.slice(newline + 1);
      }
      if (pending.length > maxLength) {
        // Discard an unbounded partial line rather than leak a split credential.
        emit('[Output line exceeded the size limit and was omitted.]');
        pending = '';
        dropping = true;
      }
    },
    flush() { if (pending && !dropping) emit(redactor.redact(pending)); pending = ''; dropping = false; },
  };
}

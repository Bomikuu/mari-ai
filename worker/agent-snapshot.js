import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRedactor, secretEnvironmentValues } from '../server/security.js';

const skip = /^(?:\.|node_modules$|vendor$|dist$|build$|coverage$|graphify-out$|logs?$|uploads?$|storage$|runtime$|data$|users?$|customers?$|secrets?$|credentials?$|output$)/i;
const sensitive = /(?:secret|credential|password|token|private.?key|service.?account|\.env|\.pem$|\.key$|\.db$|\.sqlite)/i;
const textFile = /\.(?:jsx?|tsx?|css|scss|html|vue|svelte|astro|md)$/i;

export async function createAgentSnapshot(source, destination, { signal, maxFiles = 120, maxBytes = 1024 * 1024 } = {}) {
  const root = await fs.realpath(source);
  await fs.mkdir(destination, { recursive: false, mode: 0o700 });
  const target = await fs.realpath(destination), redactor = createRedactor(secretEnvironmentValues());
  const queue = [{ full: root, relative: '' }], files = [];
  let bytes = 0, visited = 0, omitted = 0;
  while (queue.length && files.length < maxFiles && visited < 2000) {
    if (signal?.aborted) throw Object.assign(new Error('Agent task cancelled.'), { cancelled: true });
    const current = queue.shift();
    const entries = (await fs.readdir(current.full, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++visited > 2000 || files.length >= maxFiles) break;
      if (entry.isSymbolicLink() || skip.test(entry.name) || sensitive.test(entry.name) || entry.name === 'AGENTS.md') { omitted++; continue; }
      const full = path.join(current.full, entry.name), relative = path.join(current.relative, entry.name);
      const canonical = await fs.realpath(full).catch(() => null);
      if (canonical !== full || full === target || !full.startsWith(root + path.sep)) continue;
      if (entry.isDirectory()) { if (relative.split(path.sep).length < 5) queue.push({ full, relative }); continue; }
      if (!entry.isFile() || !textFile.test(entry.name) && entry.name !== 'package.json') continue;
      const handle = await fs.open(full, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
      if (!handle) continue;
      let content;
      try { const info = await handle.stat(); if (!info.isFile() || info.size > 100000 || bytes + info.size > maxBytes) { omitted++; continue; } content = await handle.readFile('utf8'); }
      finally { await handle.close(); }
      if (/-----BEGIN .*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,})/.test(content)) { omitted++; continue; }
      if (entry.name === 'package.json') {
        try { const pkg = JSON.parse(content); content = JSON.stringify({ name: pkg.name, description: pkg.description, scripts: Object.keys(pkg.scripts || {}), dependencies: Object.keys(pkg.dependencies || {}), devDependencies: Object.keys(pkg.devDependencies || {}) }, null, 2); } catch { continue; }
      }
      content = redactor.redact(content);
      const output = path.join(target, relative); await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      await fs.writeFile(output, content, { flag: 'wx', mode: 0o400 });
      bytes += Buffer.byteLength(content); files.push({ path: relative, sha256: createHash('sha256').update(content).digest('hex') });
    }
  }
  return { files, bytes, omitted, truncated: files.length >= maxFiles || visited >= 2000, capturedAt: new Date().toISOString() };
}

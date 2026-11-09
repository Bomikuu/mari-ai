import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { id, now } from './store.js';
import { isNewspaperArticleUrl } from './newspaper-sources.js';

const HOSTS = { gma: ['images.gmanews.tv', 'data.gmanetwork.com'], dota2: ['clan.akamai.steamstatic.com', 'clan.fastly.steamstatic.com', 'shared.akamai.steamstatic.com', 'shared.fastly.steamstatic.com'], valorant: ['images.contentstack.io', 'cmsassets.rgpub.io'] };
const group = (source) => source?.startsWith('gma-') ? 'gma' : source;
export function newspaperImageUrl(value, sourceId) {
  try { const u = new URL(String(value).replace(/&amp;/g, '&')); return u.protocol === 'https:' && !u.username && !u.password && !u.port && value.length <= 2048 && HOSTS[group(sourceId)]?.includes(u.hostname) ? u.href : null; } catch { return null; }
}
export function newspaperArticleImage(html, sourceId) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1].toLowerCase(), m[2]]));
    if (['og:image', 'og:image:secure_url', 'twitter:image'].includes((attrs.property || attrs.name || '').toLowerCase())) { const u = newspaperImageUrl(attrs.content, sourceId); if (u) return u; }
  }
  return null;
}
function articleAllowed(url, sourceId) {
  if (isNewspaperArticleUrl(url, sourceId)) return true;
  try { const u = new URL(url); return sourceId === 'dota2' && u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname === 'steamcommunity.com' && /^\/(?:games\/dota2|ogg\/570)\/announcements\/detail\/\d+\/?$/.test(u.pathname); } catch { return false; }
}
async function boundedFetch(url, { allowed, fetchImpl, signal, bytes, types }) {
  const timeout = AbortSignal.timeout(7000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!allowed(url)) throw new Error('Publisher URL is outside the source allowlist.');
    const r = await fetchImpl(url, { redirect: 'manual', signal: combined, headers: { Accept: types.join(', '), 'User-Agent': 'MariDaily/1.0 (private personal digest)' } });
    if ([301, 302, 303, 307, 308].includes(r.status)) { await r.body?.cancel(); url = new URL(r.headers.get('location'), url).href; continue; }
    if (!r.ok || !types.includes((r.headers.get('content-type') || '').split(';')[0].trim()) || Number(r.headers.get('content-length')) > bytes) { await r.body?.cancel(); throw new Error('Publisher response unavailable or too large.'); }
    const chunks = []; let length = 0;
    for await (const chunk of r.body) { length += chunk.length; if (length > bytes) throw new Error('Publisher response too large.'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw new Error('Publisher redirect limit exceeded.');
}

// Publisher metadata belongs to the selected article; no model-selected URLs.
export async function collectNewspaperImages({ edition, directory, signal, fetchImpl = fetch }) {
  const artifacts = [], imageFiles = {}, stories = edition.stories.map((s) => ({ ...s, image: undefined }));
  const lead = stories.find((s) => s.section === 'philippines') || stories.find((s) => s.section === 'world');
  const game = stories.find((s) => s.section === 'dota') || stories.find((s) => s.section === 'valorant');
  for (const story of [lead, game].filter(Boolean)) {
    if (signal?.aborted) throw signal.reason || new Error('Image collection cancelled.');
    if (!HOSTS[group(story.sourceId)] || !articleAllowed(story.url, story.sourceId)) continue;
    let filename;
    try {
      const html = await boundedFetch(story.url, { allowed: (u) => articleAllowed(u, story.sourceId), fetchImpl, signal, bytes: 2 * 1024 * 1024, types: ['text/html'] });
      const sourceUrl = newspaperArticleImage(html.toString(), story.sourceId); if (!sourceUrl) continue;
      const input = await boundedFetch(sourceUrl, { allowed: (u) => !!newspaperImageUrl(u, story.sourceId), fetchImpl, signal, bytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] });
      const decoder = sharp(input, { limitInputPixels: 20000000, failOn: 'warning', animated: false }), meta = await decoder.metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format) || meta.width < 150 || meta.height < 100) continue;
      const { data, info } = await decoder.rotate().resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
      if (data.length > 2 * 1024 * 1024) continue;
      const artifactId = id('artifact'), credit = `Image: ${story.sourceName}`; filename = path.join(directory, `${artifactId}.jpg`);
      await fs.writeFile(filename, data, { flag: 'wx', mode: 0o600 });
      artifacts.push({ id: artifactId, jobId: edition.jobId || null, kind: 'newspaper_image', mime: 'image/jpeg', path: filename, title: credit, createdAt: now(), width: info.width, height: info.height, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), metadata: { editionId: edition.id, storyId: story.id, sourceUrl, articleUrl: story.url, source: 'publisher-metadata' } });
      imageFiles[artifactId] = filename; story.image = { artifactId, width: info.width, height: info.height, credit, sourceUrl };
    } catch (error) { if (filename) await fs.rm(filename, { force: true }); if (signal?.aborted) throw signal.reason || error; }
  }
  return { stories, artifacts, imageFiles };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { newspaperImageUrl, newspaperArticleImage, collectNewspaperImages } from '../server/newspaper-images.js';
import { createStore } from '../server/store.js';
import { reflowNewspaper } from '../scripts/newspaper-reflow.js';

const article = 'https://www.gmanetwork.com/news/topstories/nation/123456/example/story/';
const image = 'https://images.gmanews.tv/webpics/2026/11/example.jpg';
const story = { id: 'gma-nation_fixture', section: 'philippines', sourceId: 'gma-nation', sourceName: 'Synthetic publisher', url: article, title: 'A synthetic front page', summary: 'This synthetic story verifies the complete summary and source metadata survive a layout change, without requesting another model turn or replacing the previous saved artifact.', publishedAt: '2026-11-08T23:00:00Z' };
const edition = () => ({ id: 'fixture', date: '2026-11-09', generatedAt: '2026-11-08T23:01:00Z', status: 'partial', stories: [story], sources: [], pages: 2, market: { status: 'unavailable', items: [] }, pdfArtifact: { id: 'previous', url: '/api/artifacts/previous/content' } });
async function directory(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-paper-images-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }

test('image metadata only accepts the matching fixed publisher/CDN hosts', () => {
  assert.equal(newspaperImageUrl(image, 'gma-nation'), image);
  for (const bad of ['http://images.gmanews.tv/a.jpg', 'https://images.gmanews.tv.evil.test/a.jpg', 'https://user:secret@images.gmanews.tv/a.jpg', 'https://127.0.0.1/a.jpg', 'https://images.gmanews.tv:444/a.jpg']) assert.equal(newspaperImageUrl(bad, 'gma-nation'), null);
  assert.equal(newspaperImageUrl(image, 'valorant'), null);
  assert.equal(newspaperArticleImage(`<meta content="${image}?a=1&amp;b=2" property="og:image">`, 'gma-nation'), `${image}?a=1&b=2`);
  assert.equal(newspaperArticleImage('<meta property="og:image" content="https://evil.test/a.png">', 'gma-nation'), null);
});

test('selected article image is sanitized into a private owned JPEG with source credit', async (t) => {
  const dir = await directory(t), input = await sharp({ create: { width: 400, height: 250, channels: 3, background: '#c9b79b' } }).png().toBuffer(), calls = [];
  const result = await collectNewspaperImages({ edition: edition(), directory: dir, fetchImpl: async (url, options) => { calls.push(url); assert.equal(options.redirect, 'manual'); return new Response(url === article ? `<meta property="og:image" content="${image}">` : input, { headers: { 'content-type': url === article ? 'text/html' : 'image/png' } }); } });
  assert.deepEqual(calls, [article, image]); assert.equal(result.artifacts.length, 1);
  const artifact = result.artifacts[0]; assert.equal(artifact.metadata.articleUrl, article); assert.equal(artifact.metadata.sourceUrl, image); assert.equal((await fs.stat(artifact.path)).mode & 0o777, 0o600);
  assert.equal((await sharp(artifact.path).metadata()).format, 'jpeg'); assert.equal(result.stories[0].image.artifactId, artifact.id);
  assert.equal(JSON.stringify(result.stories).includes(dir), false);
});

test('blocked, invalid, oversized and off-site redirected images are omitted without losing stories', async (t) => {
  const dir = await directory(t);
  for (const response of [() => new Response('blocked', { status: 403 }), () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }), () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), () => new Response('oversized', { headers: { 'content-type': 'image/jpeg', 'content-length': String(6 * 1024 * 1024) } }), () => new Response('not a jpeg', { headers: { 'content-type': 'image/jpeg' } })]) {
    const calls = [], result = await collectNewspaperImages({ edition: edition(), directory: dir, fetchImpl: async (url) => { calls.push(url); return url === article ? new Response(`<meta property="og:image" content="${image}">`, { headers: { 'content-type': 'text/html' } }) : response(); } });
    assert.equal(result.artifacts.length, 0); assert.equal(result.stories[0].summary, story.summary); assert.ok(calls.every((url) => [article, image].includes(url)));
  }
  assert.deepEqual(await fs.readdir(dir), []);
});

test('layout-only reflow retains reporting times and previous PDF; failure leaves edition untouched', async (t) => {
  const dir = await directory(t), store = createStore(dir); t.after(() => store.close());
  await fs.mkdir(path.join(dir, 'artifacts')); const previous = path.join(dir, 'artifacts', 'previous.pdf'); await fs.writeFile(previous, 'previous edition');
  store.put('artifacts', { id: 'previous', path: previous }); store.put('settings', { id: 'newspaper:edition:fixture', edition: edition() });
  const result = await reflowNewspaper({ store, dataDir: dir, withImages: false, fetchImpl: () => { throw new Error('No network or model needed.'); } });
  assert.equal(result.modelCalls, 0); assert.equal(result.pages, 1);
  const saved = store.get('settings', 'newspaper:edition:fixture').edition;
  assert.equal(saved.generatedAt, edition().generatedAt); assert.equal(saved.stories[0].summary, story.summary); assert.equal(saved.renderingHistory[0].pdfArtifact.id, 'previous'); assert.equal(await fs.readFile(previous, 'utf8'), 'previous edition');
  assert.equal(JSON.stringify(saved.printPlan).includes(dir), false);
  saved.stories[0].summary = 'x'.repeat(301); store.put('settings', { id: 'newspaper:edition:fixture', edition: saved });
  const before = JSON.stringify(store.get('settings', 'newspaper:edition:fixture')), artifacts = store.list('artifacts').length;
  await assert.rejects(reflowNewspaper({ store, dataDir: dir, withImages: false }), /printable content bounds/);
  assert.equal(JSON.stringify(store.get('settings', 'newspaper:edition:fixture')), before); assert.equal(store.list('artifacts').length, artifacts);
});

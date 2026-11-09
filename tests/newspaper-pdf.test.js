import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { renderNewspaperPdf } from '../server/newspaper-pdf.js';
import { newspaperPages, marketPrice, marketChange, newspaperDate, safeNewspaperUrl } from '../shared/newspaper-layout.js';
const exec = promisify(execFile);

function fixture({ long = false, empty = false } = {}) {
  const sections = ['philippines', 'philippines', 'world', 'world', 'valorant', 'dota', 'crypto', 'crypto'];
  return { id: 'synthetic-edition', date: '2026-11-07', timeZone: 'Asia/Manila', generatedAt: '2026-11-06T23:00:00Z', status: empty ? 'partial' : 'ready',
    stories: empty ? [] : sections.map((section, index) => ({ id: `story-${index}`, section, title: long ? 'Longer newspaper headlines remain clearly legible while every full summary stays on paper' : `${section} synthetic story ${index + 1}`,
      summary: long ? 'Readers receive a compact account of confirmed developments with enough context to understand the available reporting. Each item preserves its source and publication date, and the edition avoids replacing unavailable information with assumptions or invented numbers for the morning reader.' : 'This synthetic fixture checks the newspaper layout. It keeps a short factual paragraph together with its source and publication date, without borrowing actual reporting or making claims about the current news.',
      sourceName: long ? 'Synthetic newsroom with an intentionally longer source publication name' : 'Synthetic newsroom', url: `https://example.test/news/${'a'.repeat(long ? 600 : 2)}?article=${index}`, publishedAt: '2026-11-06T22:00:00Z', latestKnown: ['valorant', 'dota', 'crypto'].includes(section) })),
    sources: [{ id: 'fixture', name: 'Synthetic newsroom', status: empty ? 'error' : 'ready', fetchedAt: '2026-11-06T23:00:00Z' }],
    market: { status: empty ? 'unavailable' : 'ready', fetchedAt: '2026-11-06T23:00:00Z', items: empty ? [] : [{ id: 'bitcoin', symbol: 'BTC', usd: 100000, php: 5600000, change24h: -2.13, updatedAt: '2026-11-06T22:59:00Z' }, { id: 'ethereum', symbol: 'ETH', usd: 4000, php: 224000, change24h: 0.78, updatedAt: '2026-11-06T22:59:00Z' }, { id: 'solana', symbol: 'SOL', usd: 160, php: 8960, change24h: null, updatedAt: '2026-11-06T22:59:00Z' }] } };
}

test('shared paper groups keep five topics on two pages and preserve unknown market values', () => {
  const pages = newspaperPages(fixture()); assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].sections.map((s) => s.id), ['philippines', 'world']);
  assert.equal(pages[0].lead.id, 'story-0');
  assert.equal(pages[0].columns.length, 3);
  assert.deepEqual(pages[1].columns.map((c) => c.map((s) => s.id)), [['valorant'], ['dota'], ['crypto']]);
  const placed = pages.flatMap((page) => [...(page.lead ? [page.lead.id] : []), ...page.columns.flatMap((column) => column.flatMap((section) => section.stories.map((story) => story.id)))]);
  assert.equal(placed.length, 8); assert.equal(new Set(placed).size, 8);
  const sparse = fixture(); sparse.stories = sparse.stories.filter((story) => story.section === 'world');
  assert.equal(newspaperPages(sparse)[0].lead.id, 'story-2');
  assert.equal(marketPrice(null), 'Unavailable'); assert.equal(marketChange(null), 'Unavailable');
  assert.equal(safeNewspaperUrl('javascript:alert(1)'), null); assert.equal(safeNewspaperUrl('https://user:secret@example.test'), null);
  assert.ok(newspaperDate('2026-11-06T23:00:00Z', { time: true }).includes('7:00'));
});

test('PDF prefers one A4 page and retains full summaries with a readable fallback', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-paper-pdf-'));t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, edition] of [['normal', fixture()], ['long', fixture({long:true})], ['empty', fixture({empty:true})]]) {
    const filename = path.join(directory, `${name}.pdf`), result = await renderNewspaperPdf({edition,filename});
    const meta = (await exec('pdfinfo',[filename])).stdout;
    assert.match(meta,new RegExp(`Pages:\\s+${result.pages}`));assert.match(meta,/Page size:\s+595\.28 x 841\.89 pts/);
    assert.ok([1,2].includes(result.pages)); if (name === 'normal' || name === 'empty') assert.equal(result.pages, 1); assert.ok(result.layout.every((line) => line.y + line.height <= 834));
    const text = (await exec('pdftotext',['-raw',filename,'-'])).stdout;
    for (const story of edition.stories) assert.ok(text.replace(/\s+/g,' ').includes(story.summary), `Missing complete body in ${name}`);
    if (name==='empty') {
      assert.ok(text.includes('Market prices are unavailable'));
      const header=result.layout.find((line)=>line.text==='MARKET WATCH'), notice=result.layout.find((line)=>line.text.startsWith('Market prices are unavailable'));
      assert.ok(notice.y>=header.y+header.height+10,'Unavailable notice must sit below the market heading, not overlap its rule or type.');
    }
    else { const bodies=result.layout.filter((line)=>line.role==='summary'); assert.equal(bodies.length, edition.stories.length); assert.equal(new Set(bodies.map(b=>b.storyId)).size, edition.stories.length); assert.ok(bodies.every(line=>line.size >= (result.pages===1?8.2:9.5))); }
    assert.ok(result.printPlan.blocks.every(b=>b.x+b.width <= result.width && b.y+b.height <= result.height));
  }
});

test('PDF refuses invalid content, unreadable overflow and existing output instead of clipping', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-paper-invalid-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const output=path.join(directory,'edition.pdf'), invalid=fixture();invalid.stories[0].summary='x'.repeat(301);
  await assert.rejects(renderNewspaperPdf({edition:invalid,filename:output}),/printable content bounds/);
  await assert.rejects(fs.access(output));
  await fs.writeFile(output,'existing');await assert.rejects(renderNewspaperPdf({edition:fixture({empty:true}),filename:output}),/EEXIST/);assert.equal(await fs.readFile(output,'utf8'),'existing');
});

test('dense valid reporting falls back to two measured A4 sheets without smaller bodies or lost stories', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-paper-dense-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const edition = fixture({long:true});
  for (const story of edition.stories) {
    story.title = 'Synthetic presentation assessment retains complete headlines and detailed publication context';
    story.sourceName = 'Synthetic newsroom with a deliberately extended publication credit for layout verification';
  }
  const image = path.join(directory, 'synthetic.jpg');
  await sharp({ create: { width: 400, height: 250, channels: 3, background: '#b8aa98' } }).jpeg().toFile(image);
  edition.stories.find(s=>s.section==='dota').image = { artifactId: 'dense-art', width:400, height:250, credit:'Synthetic test illustration' };
  const filename = path.join(directory, 'dense.pdf'), result = await renderNewspaperPdf({edition,filename,imageFiles:{'dense-art':image}});
  assert.equal(result.pages,2); assert.equal(result.printPlan.bodySize,9.5);
  const bodies=result.layout.filter(b=>b.role==='summary'); assert.equal(bodies.length,8); assert.equal(new Set(bodies.map(b=>b.storyId)).size,8);
  const text=(await exec('pdftotext',['-raw',filename,'-'])).stdout.replace(/\s+/g,' ');
  for (const story of edition.stories) assert.ok(text.includes(story.summary));
  const meta=(await exec('pdfinfo',[filename])).stdout; assert.match(meta,/Pages:\s+2/);
});

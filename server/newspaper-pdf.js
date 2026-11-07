import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { newspaperPages, newspaperDate, newspaperSourceHost, newspaperAvailability, marketPrice, marketChange, validateNewspaperPresentation, NEWSPAPER_PRESENTATION } from '../shared/newspaper-layout.js';

const A4 = [595.28, 841.89], MARGIN = 32, WIDTH = A4[0] - MARGIN * 2;
const FONT_ROOT = '/usr/share/fonts/truetype/dejavu';
const files = { serif: 'DejaVuSerif.ttf', bold: 'DejaVuSerif-Bold.ttf', sans: 'DejaVuSans.ttf', sansBold: 'DejaVuSans-Bold.ttf' };
const clean = (value) => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim();

export async function renderNewspaperPdf({ edition, filename }) {
  validateNewspaperPresentation(edition);
  for (const file of Object.values(files)) await fs.access(path.join(FONT_ROOT, file));
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, size: A4, margin: 0, info: { Title: `Mari Daily · ${edition.date}`, Author: 'Mari', Subject: 'Classic broadsheet · two-page daily digest', CreationDate: new Date(edition.generatedAt || Date.now()) } });
  for (const [name, file] of Object.entries(files)) doc.registerFont(name, path.join(FONT_ROOT, file));
  const buffers = [], layout = [];
  const completion = new Promise((resolve, reject) => { doc.on('data', (chunk) => buffers.push(chunk)); doc.once('end', resolve); doc.once('error', reject); });
  const measure = (value, width, font, size, lineGap = 1) => doc.font(font).fontSize(size).heightOfString(clean(value), { width, lineGap });
  const text = (value, x, y, width, { font = 'serif', size = 10, bottom = 775, color = '#171717', link, align = 'left', lineGap = 1 } = {}) => {
    const content = clean(value); doc.font(font).fontSize(size).fillColor(color);
    const height = doc.heightOfString(content, { width, lineGap, align });
    if (y + height > bottom + 0.1) throw new Error(`Two-page newspaper overflow at ${content.slice(0, 60)}.`);
    doc.text(content, x, y, { width, height: height + 1, lineGap, align, ...(link ? { link, underline: false } : {}) });
    layout.push({ page: doc.bufferedPageRange().count, text: content, x, y, width, height, size });
    return y + height;
  };
  const rule = (y, x = MARGIN, width = WIDTH, weight = 0.5) => doc.lineWidth(weight).strokeColor('#262626').moveTo(x, y).lineTo(x + width, y).stroke();
  const byline = (story) => `${story.sourceName} · ${story.latestKnown ? 'Latest known update · ' : ''}${newspaperDate(story.publishedAt)}`;
  const style = (scale, page, lead = false) => ({ title: lead ? Math.max(28, 33 * scale) : Math.max(page === 1 ? 14 : 12.2, (page === 1 ? 18 : 15) * scale), body: lead ? 11.5 : Math.max(9.5, 10 * scale), gap: lead ? 8 : 3, after: lead ? 0 : 9, bodyGap: lead ? 2 : 0.25, meta: lead ? 7.2 : 6.8 });
  const storyHeight = (story, width, page, scale, lead = false) => {
    const s = style(scale, page, lead), bodyWidth = lead ? width * 0.88 : width;
    return measure(story.title, width, 'bold', s.title, 0) + s.gap + measure(byline(story), width, 'sans', s.meta) + s.gap
      + measure(story.summary, bodyWidth, 'serif', s.body, s.bodyGap) + s.gap + measure(newspaperSourceHost(story.url), width, 'sans', 7.1) + s.after;
  };
  const columnHeight = (column, width, page, scale) => column.reduce((sum, section) => sum + measure(section.title.toUpperCase(), width, 'sansBold', 8.5) + 11
    + (section.stories.length ? section.stories.reduce((height, story) => height + storyHeight(story, width, page, scale), 0)
      : measure('No current items were returned for this section.', width, 'serif', 9.5) + 12), 0) - (column.length ? column.at(-1).stories.length ? style(scale, page).after : 12 : 0);
  const drawStory = (story, x, y, width, page, scale, bottom, lead = false) => {
    const s = style(scale, page, lead);
    y = text(story.title, x, y, width, { font: 'bold', size: s.title, lineGap: 0, bottom, link: story.url }) + s.gap;
    y = text(byline(story), x, y, width, { font: 'sans', size: s.meta, bottom, color: '#454545' }) + s.gap;
    y = text(story.summary, x, y, lead ? width * 0.88 : width, { size: s.body, lineGap: s.bodyGap, bottom }) + s.gap;
    return text(newspaperSourceHost(story.url), x, y, width, { font: 'sans', size: 7.1, color: '#454545', link: story.url, bottom }) + s.after;
  };
  try {
    for (const page of newspaperPages(edition)) {
      doc.addPage({ size: A4, margin: 0 });
      rule(23, MARGIN, WIDTH, 0.5);
      text('MARI DAILY', MARGIN, 34, WIDTH, { font: 'bold', size: page.number === 1 ? 44 : 35, align: 'center', lineGap: 0, bottom: 92 });
      const metaY = page.number === 1 ? 94 : 83;
      text(newspaperDate(edition.date, { weekday: true }), MARGIN, metaY, WIDTH * 0.7, { font: 'sans', size: 7.8 });
      text(`MANILA · ${page.number} / 2`, MARGIN + WIDTH * 0.7, metaY, WIDTH * 0.3, { font: 'sansBold', size: 7.8, align: 'right' });
      rule(metaY + 17, MARGIN, WIDTH, 1.2); rule(metaY + 20, MARGIN, WIDTH, 0.35);
      const start = metaY + 35, gap = 16, width = (WIDTH - gap * 2) / 3, bottom = page.number === 1 ? 728 : 632;
      const scales = [1, 0.96, 0.92, 0.88, 0.84, 0.8];
      const columnStart = (scale) => start + (page.lead ? storyHeight(page.lead, WIDTH, page.number, scale, true) + 28 : 0);
      const scale = scales.find((candidate) => page.columns.every((column) => columnStart(candidate) + columnHeight(column, width, page.number, candidate) <= bottom));
      if (scale == null) throw new Error(`Page ${page.number} exceeds the readable two-page layout. Shorten the bounded summaries before rendering.`);
      const top = columnStart(scale);
      if (page.lead) { drawStory(page.lead, MARGIN, start, WIDTH, page.number, scale, top - 16, true); rule(top - 13, MARGIN, WIDTH, 0.7); }
      for (const [index, column] of page.columns.entries()) {
        const x = MARGIN + index * (width + gap); let y = top;
        if (index && column.length) doc.lineWidth(0.35).strokeColor('#aaaaaa').moveTo(x - gap / 2, top).lineTo(x - gap / 2, bottom).stroke();
        for (const section of column) {
          y = text(section.title.toUpperCase(), x, y, width, { font: 'sansBold', size: 8.5, bottom }) + 11;
          if (!section.stories.length) y = text('No current items were returned for this section.', x, y, width, { size: 9.5, bottom }) + 12;
          else for (const story of section.stories) y = drawStory(story, x, y, width, page.number, scale, bottom);
        }
      }
      if (page.number === 2) {
        rule(641); text('MARKET WATCH', MARGIN, 653, WIDTH, { font: 'sansBold', size: 9 });
        const items = edition.market?.status === 'ready' ? edition.market.items || [] : [];
        if (items.length) {
          const col = [MARGIN, MARGIN + 72, MARGIN + 214, MARGIN + 393];
          for (const [index, label] of ['ASSET', 'USD', 'PHP', '24H USD'].entries()) text(label, col[index], 674, index === 3 ? 138 : index === 0 ? 66 : 170, { font: 'sans', size: 7.2 });
          for (const [index, item] of items.entries()) {
            const y = 691 + index * 18;
            text(item.symbol.toUpperCase(), col[0], y, 66, { font: 'sansBold', size: 9.5 });
            text(marketPrice(item.usd), col[1], y, 136, { font: 'sans', size: 9.5 }); text(marketPrice(item.php, 'PHP'), col[2], y, 172, { font: 'sans', size: 9.5 }); text(marketChange(item.change24h), col[3], y, 138, { font: 'sans', size: 9.5 });
          }
          const times = items.map((item) => item.updatedAt).filter((value) => value && !Number.isNaN(Date.parse(value))).sort();
          text(`CoinGecko · ${newspaperDate(times[0] || edition.market.fetchedAt, { time: true })} Manila · saved snapshot`, MARGIN, 749, WIDTH, { font: 'sans', size: 7.2 });
        } else text('Market prices are unavailable for this edition. No replacement values have been estimated.', MARGIN, 691, WIDTH, { size: 10 });
        text('24h change is measured in USD. Quotes are frozen for this edition.', MARGIN, 766, WIDTH, { font: 'sans', size: 7.2, bottom: 782 });
      } else text(newspaperAvailability(edition), MARGIN, 746, WIDTH, { font: 'sans', size: 7.8, bottom: 780 });
      rule(787);
      text(`Prepared ${newspaperDate(edition.generatedAt, { time: true })} Manila`, MARGIN, 800, WIDTH - 90, { font: 'sans', size: 7.1, bottom: 823 });
      text(`MARI DAILY · ${page.number}`, A4[0] - MARGIN - 90, 800, 90, { font: 'sansBold', size: 7.1, align: 'right', bottom: 823 });
    }
    if (doc.bufferedPageRange().count !== 2) throw new Error('The newspaper did not produce exactly two A4 pages.');
    doc.end(); await completion;
    const buffer = Buffer.concat(buffers); if (buffer.length < 1000 || buffer.length > 4 * 1024 * 1024) throw new Error('The newspaper PDF exceeds its size bounds.');
    await fs.writeFile(filename, buffer, { flag: 'wx', mode: 0o600 });
    return { pages: 2, width: A4[0], height: A4[1], bytes: buffer.length, layout, presentation: NEWSPAPER_PRESENTATION };
  } catch (error) { doc.destroy(error); await completion.catch(() => {}); throw error; }
}

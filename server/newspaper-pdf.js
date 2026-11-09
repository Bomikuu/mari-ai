import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { NEWSPAPER_SECTIONS, newspaperDate, newspaperAvailability, marketPrice, marketChange, validateNewspaperPresentation, NEWSPAPER_PRESENTATION } from '../shared/newspaper-layout.js';

import {addPersonalBriefing} from './newspaper-personal-pdf.js';
import {validatePersonalBriefing} from '../shared/newspaper-briefing.js';

const A4 = [595.28, 841.89], M = 20, W = A4[0] - 2 * M;
const ROOT = '/usr/share/fonts/truetype/dejavu';
const FONTS = { serif: 'DejaVuSerif.ttf', bold: 'DejaVuSerif-Bold.ttf', sans: 'DejaVuSans.ttf', sansBold: 'DejaVuSans-Bold.ttf' };
const INK = '#161513', RED = '#9b1717', RULE = '#746f65';
const clean = (value) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();

// Persist measured lines so the browser and PDF paint the same composition.
function typesetter(doc, edition, { body, images, split = false, grid = false }) {
  const blocks = [], gap = body < 8.4 ? 3 : 4; let page = 1;
  const wrap = (value, width, font, size) => {
    doc.font(font).fontSize(size); const lines = []; let line = '';
    for (const word of clean(value).split(' ')) {
      if (doc.widthOfString(word) > width) throw new Error('Unbreakable newspaper text exceeds its column.');
      const next = line ? `${line} ${word}` : word;
      if (line && doc.widthOfString(next) > width) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line); return lines;
  };
  const text = (value, x, y, width, options = {}) => {
    const { font = 'serif', size = body, color = INK, align = 'left', link, storyId, role } = options;
    const lineHeight = options.lineHeight || size * 1.19, lines = wrap(value, width, font, size), height = lines.length * lineHeight;
    blocks.push({ type: 'text', page, text: clean(value), lines, x, y, width, height, font, size, lineHeight, color, align, ...(link ? { link } : {}), ...(storyId ? { storyId, role } : {}) }); return y + height;
  };
  const line = (x, y, width, height = 0, weight = .45) => blocks.push({ type: 'line', page, x, y, width, height, weight, color: RULE });
  const fill = (x, y, width, height, color) => blocks.push({ type: 'fill', page, x, y, width, height, color });
  const label = (value, x, y, width) => text(value.toUpperCase(), x, y, width, { font: 'bold', size: body < 8.4 ? 8.5 : 9, color: RED }) + gap;
  function picture(story, x, y, width, height) {
    const image = story.image, ratio = Math.min(width / image.width, height / image.height), iw = image.width * ratio, ih = image.height * ratio;
    blocks.push({ type: 'image', page, x: x + (width - iw) / 2, y, width: iw, height: ih, artifactId: image.artifactId, alt: `Publisher image for: ${story.title}`, link: story.url });
    return text(image.credit, x, y + ih + 4, width, { size: 6.4 }) + 5;
  }
  function story(s, x, y, width, { title = 15, imageHeight = 0, showLabel = true } = {}) {
    title -= body < 8.4 ? 1.2 : 0;
    if (showLabel) y = label(NEWSPAPER_SECTIONS[s.section], x, y, width);
    y = text(s.title, x, y, width, { font: 'bold', size: title, lineHeight: title * 1.06, link: s.url, storyId: s.id, role: 'title' }) + gap;
    y = text(`${s.sourceName} · ${newspaperDate(s.publishedAt)}${s.latestKnown ? ' · latest known update' : ''}`, x, y, width, { size: body < 8.4 ? 6.2 : 6.6 }) + gap;
    y = text(s.summary, x, y, width, { size: body, storyId: s.id, role: 'summary' }) + gap;
    if (imageHeight && s.image && images[s.image.artifactId]) y = picture(s, x, y, width, imageHeight);
    return y;
  }
  function masthead() {
    text('A personal morning digest', M, 28, 88, { size: 9.3, align: 'center' }); line(116, 20, 0, 45);
    text('MARI DAILY', 125, 15, 360, { font: 'bold', size: 45, lineHeight: 49, align: 'center' }); line(492, 20, 0, 45);
    text('NEWS · GAMES & MARKETS', 502, 30, 73, { font: 'bold', size: 8, align: 'center' });
    line(M, 76, W, 0, .8);
    text('PRIVATE EDITION', M, 83, 110, { font: 'bold', size: 7 });
    text(newspaperDate(edition.date, { weekday: true }).toUpperCase(), 130, 83, 306, { font: 'bold', size: 7.5, align: 'center' });
    text(`MANILA · ${page} OF ${split ? 2 : 1}`, 440, 83, 135, { font: 'bold', size: 7, align: 'right' }); line(M, 99, W, 0, .8);
  }
  function footer() {
    line(M, 788, W);
    text(newspaperAvailability(edition), M, 795, W, { size: 6.4 });
    text(`Prepared ${newspaperDate(edition.sourceGeneratedAt || edition.generatedAt, { time: true })} Manila · source-linked personal digest`, M, 817, 460, { size: 6.2 });
    text(`MARI DAILY · ${page}`, 480, 817, 95, { font: 'bold', size: 6.2, align: 'right' });
  }
  function markets(y, brief) {
    const before = blocks.length; fill(M, y, W, 125, '#f4eee4'); line(M, y, W);
    const top = label('Business & markets', M + 8, y + 7, W - 16), bx = M + 8, bw = 220, tx = 264, tw = 303;
    const end = brief ? story(brief, bx, top, bw, { title: 13, showLabel: false }) : text('BTC · ETH · SOL', bx, top, bw, { font: 'bold', size: 15 });
    line(254, top, 0, Math.max(82, end - top));
    let ty = text('MARKET WATCH', tx, top, tw, { font: 'bold', size: 9 }) + 5;
    const items = edition.market?.status === 'ready' ? edition.market.items || [] : [];
    if (items.length) {
      const xs = [tx, tx + 35, tx + 121, tx + 233], widths = [30, 80, 106, 70];
      ['ASSET', 'USD', 'PHP', '24H USD'].forEach((v, i) => text(v, xs[i], ty, widths[i], { font: 'bold', size: 6.5 })); ty += 14; line(tx, ty - 3, tw);
      for (const item of items) {
        [item.symbol.toUpperCase(), marketPrice(item.usd), marketPrice(item.php, 'PHP'), marketChange(item.change24h)].forEach((v, i) => text(v, xs[i], ty, widths[i], { font: i ? 'serif' : 'bold', size: 7.3, color: i === 3 && item.change24h < 0 ? RED : INK })); ty += 16; line(tx, ty - 3, tw, 0, .2);
      }
      const times = items.map((i) => i.updatedAt).filter(Boolean).sort();
      ty = text(`CoinGecko · ${newspaperDate(times[0] || edition.market.fetchedAt, { time: true })} Manila · saved snapshot`, tx, ty + 2, tw, { size: 6.2 }) + 4;
    } else ty = text('Market prices are unavailable for this edition. No replacement values have been estimated.', tx, ty + 10, tw, { size: body }) + 6;
    ty = text('24h change in USD. Quotes are frozen for this edition.', tx, ty, tw, { size: 6.2 });
    blocks[before].height = Math.max(ty, end) - y + 8; return y + blocks[before].height;
  }
  const stories = [...edition.stories];
  const take = (predicate) => { const i = stories.findIndex(predicate); return i < 0 ? null : stories.splice(i, 1)[0]; };
  masthead();
  if (grid) {
    const width=(W-36)/4;let y=112;
    for(let i=0;i<stories.length;i+=4){let end=y;for(const [column,s]of stories.slice(i,i+4).entries())end=Math.max(end,story(s,M+column*(width+12),y,width,{title:i===0&&column===0?15:12}));y=end+14;}
    if(markets(y,null)>777)throw new Error(`Compact news grid exceeds its readable A4 bounds: ${y}.`);footer();
  } else if (split) {
    const news = stories.filter((s) => ['philippines', 'world'].includes(s.section)), rest = stories.filter((s) => !news.includes(s));
    let rowY = 112;
    for (let i = 0; i < news.length; i += 2) {
      let rowEnd = rowY;
      for (const [column, s] of news.slice(i, i + 2).entries()) rowEnd = Math.max(rowEnd, story(s, column ? 307 : M, rowY, 268, { title: i === 0 && column === 0 ? 25 : 20 }));
      if (rowEnd > 778) throw new Error('Two-page newspaper exceeds its readable bounds.');
      rowY = rowEnd + 18;
    }
    footer(); page = 2; masthead();
    const crypto = rest.filter((s) => s.section === 'crypto'), games = rest.filter((s) => s.section !== 'crypto'); let end = 112;
    for (const [i, s] of games.entries()) end = Math.max(end, story(s, M + i * 282, 112, 268, { title: 23, imageHeight: 110 }));
    const cy = Math.max(400, end + 14);
    for (const [i, s] of crypto.entries()) end = Math.max(end, story(s, M + i * 282, cy, 268, { title: 18 }));
    if (markets(Math.max(end + 15, 628), null) > 778) throw new Error('Two-page markets exceed their bounds.'); footer();
  } else {
    const lead = take((s) => s.section === 'philippines') || take((s) => s.section === 'world') || take(() => true);
    const rail = [take((s) => s.section === 'world'), take((s) => s.section === 'world')].filter(Boolean);
    const secondary = [take((s) => s.section === 'philippines'), take((s) => s.section === 'dota')].filter(Boolean), marketBrief = take((s) => s.section === 'crypto');
    const mainW = 403, railX = 435, railW = 140; let leadEnd = 125;
    if (lead) {
      const hasImage = lead.image && images[lead.image.artifactId];
      leadEnd = story(lead, M, 112, hasImage ? 215 : mainW, { title: hasImage ? 24 : 30 });
      if (hasImage) leadEnd = Math.max(leadEnd, picture(lead, M + 227, 129, 176, 211));
    } else leadEnd = text('No current stories were available. Check source coverage in Mari.', M, 120, mainW);
    let railEnd = 141;
    fill(railX, 112, railW, 20, RED); text('TOP STORIES', railX + 5, 116, railW - 10, { font: 'bold', size: 11, color: '#fff', align: 'center' });
    for (const s of rail) { railEnd = story(s, railX + 3, railEnd, railW - 6, { title: 12 }) + 4; line(railX + 3, railEnd - 2, railW - 6); railEnd += 7; }
    let secondaryEnd = leadEnd;
    if (secondary.length) {
      const sy = leadEnd + 13; line(M, sy - 7, mainW);
      for (const [i, s] of secondary.entries()) { if (i) line(221, sy, 0, 170); secondaryEnd = Math.max(secondaryEnd, story(s, M + i * 211, sy, 192, { title: 16, imageHeight: 56 })); }
    }
    let y = Math.max(secondaryEnd, railEnd) + 12; line(428, 112, 0, y - 124); y = markets(y, marketBrief) + 12;
    if (stories.length) {
      line(M, y - 5, W); const width = (W - 22 * (stories.length - 1)) / stories.length; let end = y;
      for (const [i, s] of stories.entries()) end = Math.max(end, story(s, M + i * (width + 22), y, width, { title: 15 })); y = end;
    }
    if (y > 777) throw new Error(`One-page newspaper exceeds its readable bounds: body ${body}, end ${y}, lead ${leadEnd}, secondary ${secondaryEnd}, rail ${railEnd}.`); footer();
  }
  if (blocks.some((b) => b.y < 0 || b.y + b.height > 834 || b.x < 0 || b.x + b.width > A4[0])) throw new Error('Newspaper layout exceeds A4 bounds.');
  return { version: NEWSPAPER_PRESENTATION, width: A4[0], height: A4[1], pages: split ? 2 : 1, bodySize: body, blocks };
}

export async function renderNewspaperPdf({ edition, filename, imageFiles = {} }) {
  validateNewspaperPresentation(edition);
  validatePersonalBriefing(edition.personal,edition.date);
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, size: A4, margin: 0, info: { Title: `Mari Daily · ${edition.date}`, Author: 'Mari', Subject: 'Compact classic broadsheet', CreationDate: new Date(edition.generatedAt || Date.now()) } });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(ROOT, file));
  const buffers = [], completion = new Promise((resolve, reject) => { doc.on('data', (b) => buffers.push(b)); doc.once('end', resolve); doc.once('error', reject); });
  try {
    let plan;
    for (const body of [9.2, 8.8, 8.4, 8.2]) { try { plan = typesetter(doc, edition, { body, images: imageFiles }); break; } catch (error) { if (!/One-page|Unbreakable/.test(error.message)) throw error; } }
    if (!plan) {
      try { plan = typesetter(doc, edition, { body: 9.5, images: imageFiles, split: true }); }
      catch (error) {
        if (!/Two-page/.test(error.message)) throw error;
        // Complete reporting takes precedence when optional art would overflow.
        plan = typesetter(doc, edition, { body: 9.5, images: {}, split: true });
      }
    }
    if(edition.personal){
      if(plan.pages===2){let compact;for(const body of [8.4,8.2]){try{compact=typesetter(doc,edition,{body,images:{},grid:true});break;}catch(error){if(!/Compact news grid|Unbreakable/.test(error.message))throw error;}}if(!compact)throw new Error('The full newspaper and personal briefing could not fit in two readable A4 sheets.');plan=compact;}
      plan=addPersonalBriefing(doc,plan,edition);
    }
    if(plan.blocks.some(b=>b.x<0||b.y<0||b.x+b.width>A4[0]+.01||b.y+b.height>A4[1]))throw new Error('Newspaper print plan exceeds its A4 bounds.');
    for (let page = 1; page <= plan.pages; page++) {
      doc.addPage({ size: A4, margin: 0 }); doc.rect(0, 0, A4[0], A4[1]).fill('#fffdf9');
      for (const b of plan.blocks.filter((b) => b.page === page)) {
        if (b.type === 'fill') doc.rect(b.x, b.y, b.width, b.height).fill(b.color);
        if (b.type === 'line') doc.lineWidth(b.weight).strokeColor(b.color).moveTo(b.x, b.y).lineTo(b.x + b.width, b.y + b.height).stroke();
        if (b.type === 'image') doc.image(imageFiles[b.artifactId], b.x, b.y, { width: b.width, height: b.height });
        if (b.type === 'text') for (const [i, value] of b.lines.entries()) {
          doc.font(b.font).fontSize(b.size).fillColor(b.color);
          const offset = b.align === 'center' ? (b.width - doc.widthOfString(value)) / 2 : b.align === 'right' ? b.width - doc.widthOfString(value) : 0;
          doc.text(value, b.x + offset, b.y + i * b.lineHeight, { lineBreak: false, ...(b.link ? { link: b.link } : {}) });
        }
      }
    }
    if (doc.bufferedPageRange().count !== plan.pages) throw new Error('Unexpected newspaper PDF page count.');
    doc.end(); await completion; const buffer = Buffer.concat(buffers);
    if (buffer.length < 1000 || buffer.length > 8 * 1024 * 1024) throw new Error('Newspaper PDF exceeds its bounds.');
    await fs.writeFile(filename, buffer, { flag: 'wx', mode: 0o600 });
    return { pages: plan.pages, width: A4[0], height: A4[1], bytes: buffer.length, layout: plan.blocks.filter((b) => b.type === 'text'), printPlan: plan, presentation: NEWSPAPER_PRESENTATION };
  } catch (error) { doc.destroy(error); await completion.catch(() => {}); throw error; }
}

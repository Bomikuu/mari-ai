export const NEWSPAPER_TIME_ZONE = 'Asia/Manila';
export const NEWSPAPER_SECTIONS = Object.freeze({ philippines: 'Philippines', world: 'World', valorant: 'Valorant', dota: 'Dota 2', crypto: 'Crypto' });
export const NEWSPAPER_PAGE_SECTIONS = Object.freeze([['philippines', 'world'], ['valorant', 'dota', 'crypto']]);
export const NEWSPAPER_PRESENTATION = 'classic-broadsheet-v1';

export function newspaperDate(value, { time = false, weekday = false } = {}) {
  if (typeof value !== 'string' || !value) return 'Time unavailable';
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value);
  if (Number.isNaN(parsed.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-PH', { timeZone: NEWSPAPER_TIME_ZONE, year: 'numeric', month: 'short', day: 'numeric', ...(weekday ? { weekday: 'long' } : {}), ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(parsed);
}

export function safeNewspaperUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export function newspaperSourceHost(value) {
  const url = safeNewspaperUrl(value);
  return url ? new URL(url).hostname.replace(/^www\./, '') : 'Source unavailable';
}

export function newspaperPages(edition) {
  const stories = Array.isArray(edition?.stories) ? edition.stories : [];
  return NEWSPAPER_PAGE_SECTIONS.map((keys, index) => {
    const sections = keys.map((key) => ({ id: key, title: NEWSPAPER_SECTIONS[key], stories: stories.filter((story) => story.section === key) }));
    const lead = index === 0 ? sections.flatMap((section) => section.stories)[0] || null : null;
    let columns;
    if (index === 0) {
      const briefs = sections.flatMap((section) => section.stories.filter((story) => story !== lead).map((story) => ({ ...section, stories: [story] })));
      for (const section of sections.filter((section) => !section.stories.length)) briefs.push(section);
      columns = Array.from({ length: 3 }, (_, position) => briefs[position] ? [briefs[position]] : []);
    } else columns = sections.map((section) => [section]);
    return { number: index + 1, sections, lead, columns, compact: columns.some((column) => column.reduce((length, section) => length + section.stories.reduce((sum, story) => sum + story.title.length + story.summary.length + story.sourceName.length, 0), 0) > 610) };
  });
}

export function marketPrice(value, currency = 'USD') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Unavailable';
  return `${currency === 'PHP' ? 'PHP ' : '$'}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

export function marketChange(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : 'Unavailable';
}

export function newspaperAvailability(edition) {
  const failed = (edition?.sources || []).filter((source) => !['ready', 'empty'].includes(source.status));
  return failed.length ? `${failed.length} source${failed.length === 1 ? ' was' : 's were'} unavailable. Available reporting is retained; source details are saved with this edition in Mari.`
    : 'A personal digest of available reporting. Open the linked sources for the full context.';
}

export function validateNewspaperPresentation(edition) {
  if (!edition || !/^\d{4}-\d{2}-\d{2}$/.test(edition.date || '') || Number.isNaN(Date.parse(`${edition.date}T12:00:00+08:00`)) || !Array.isArray(edition.stories) || edition.stories.length > 8) throw new Error('The newspaper must have a valid date and at most eight stories.');
  const counts = {};
  for (const story of edition.stories) {
    if (!Object.hasOwn(NEWSPAPER_SECTIONS, story.section) || typeof story.title !== 'string' || !story.title.trim() || story.title.length > 100 || typeof story.summary !== 'string' || !story.summary.trim() || story.summary.length > 300 || typeof story.sourceName !== 'string' || !story.sourceName.trim() || story.sourceName.length > 100 || !safeNewspaperUrl(story.url)) throw new Error('A newspaper story exceeds the printable content bounds.');
    counts[story.section] = (counts[story.section] || 0) + 1;
    if (counts[story.section] > (['valorant', 'dota'].includes(story.section) ? 1 : 2)) throw new Error('Too many stories for one newspaper section.');
  }
  if (edition.sources != null && (!Array.isArray(edition.sources) || edition.sources.length > 12 || edition.sources.some((source) => typeof source.name !== 'string' || source.name.length > 100))) throw new Error('Newspaper source metadata exceeds its printable bounds.');
  if (edition.market?.items != null && (!Array.isArray(edition.market.items) || edition.market.items.length > 3 || edition.market.items.some((item) => typeof item.symbol !== 'string' || item.symbol.length > 8))) throw new Error('Market watch exceeds its three-asset layout.');
  return edition;
}

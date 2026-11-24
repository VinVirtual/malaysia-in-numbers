// Latest values as a JSON Feed 1.1 (one item per dataset release, so a reader shows each
// new figure once) and as plain JSON for scripts.
import { SITE_TITLE, LICENCE, datasetById } from './config.mjs';
import { TOPICS } from './topics.mjs';
import { asOfLabel } from '../../assets/js/format.js';

// "2026-11-19 13:09" from the API, read as Malaysia time (UTC+8; the API does not say).
export function sourceTime(s) {
  const m = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?$/.exec(String(s ?? ''));
  return m ? `${m[1]}T${m[2] ?? '00:00'}:00+08:00` : null;
}

export function latestJson(heads, files, builtAt) {
  const indicators = {};
  for (const t of TOPICS) {
    const h = heads[t.slug];
    const f = files[t.dataset];
    if (!h || !f) continue;
    const ds = datasetById(t.dataset);
    indicators[t.slug] = {
      title: t.title,
      title_ms: t.titleMs,
      measure: t.headline.label,
      dataset: ds.id,
      series: h.key,
      period: h.date,
      period_label: h.periodText,
      value: h.value,
      value_text: h.valueText,
      previous: h.prevDate ? { period: h.prevDate, value: h.prevValue } : null,
      change: h.change ? { text: h.change.text, versus: h.change.vs } : null,
      data_as_of: f.meta.data_as_of,
      source_last_updated: f.meta.last_updated,
      change_picked_up_at: f.fetchedAt,
      publisher: ds.publisher,
      source_page: ds.page,
      licence: LICENCE.name,
    };
  }
  return `${JSON.stringify({ generated_at: builtAt.toISOString(), licence: `${LICENCE.name} (data)`, indicators }, null, 2)}\n`;
}

export function jsonFeed(heads, files, siteUrl) {
  const items = [];
  for (const t of TOPICS) {
    const h = heads[t.slug];
    const f = files[t.dataset];
    if (!h || !f) continue;
    const url = new URL(`${t.slug}/`, siteUrl).toString();
    const ds = datasetById(t.dataset);
    const change = h.change ? ` (${h.change.text} ${h.change.vs})` : '';
    items.push({
      id: `${url}#${f.meta.data_as_of.replace(/[^0-9A-Za-z-]/g, '')}`,
      url,
      title: `${t.title}: ${h.valueText}${t.headline.per ? ` ${t.headline.per}` : ''}, ${h.periodText}`,
      content_text: `${t.headline.label}: ${h.valueText}${t.headline.per ? ` ${t.headline.per}` : ''} for ${h.periodLong}${change}. Data to ${asOfLabel(f.meta.data_as_of)}, published by ${ds.publisher} under ${LICENCE.name}.`,
      date_published: sourceTime(f.meta.last_updated) ?? f.fetchedAt,
      tags: [t.slug, ds.id],
      _malaysia_in_numbers: { value: h.value, period: h.date, dataset: ds.id, series: h.key },
    });
  }
  items.sort((a, b) => (a.date_published < b.date_published ? 1 : -1));
  return `${JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: `${SITE_TITLE}: latest figures`,
    home_page_url: siteUrl,
    feed_url: new URL('feed.json', siteUrl).toString(),
    description: 'The latest value of each indicator, one item per release of Malaysian official open data.',
    language: 'en-MY',
    items,
  }, null, 2)}\n`;
}

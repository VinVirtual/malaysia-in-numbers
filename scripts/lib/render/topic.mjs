// One page per indicator: the headline, its charts (each with table and CSV), the source's
// own caveats and a record of exactly where the numbers came from.
import { html, localHref } from '../html.mjs';
import { TOPICS } from '../topics.mjs';
import { datasetById, LICENCE } from '../config.mjs';
import { buildUrl } from '../api.mjs';
import { dayLabel, asOfLabel } from '../../../assets/js/format.js';
import { figure } from './figure.mjs';

const arrow = (dir) => (dir > 0 ? '▲' : dir < 0 ? '▼' : '■');
const dirWord = (dir) => (dir > 0 ? 'up' : dir < 0 ? 'down' : 'flat');

export function sourceLine(ds, base) {
  return html`Source: <a href="${ds.page}">${ds.publisher}</a>, dataset <code>${ds.id}</code>, via the data.gov.my API. Licence <a href="${LICENCE.url}">${LICENCE.name}</a>. <a href="${localHref(`${base}data/${ds.id}.csv`)}">Full dataset as CSV</a>.`;
}

export function renderTopic({ topic, file, head, charts, base }) {
  const ds = datasetById(topic.dataset);
  const idx = TOPICS.indexOf(topic);
  const prev = TOPICS[(idx + TOPICS.length - 1) % TOPICS.length];
  const next = TOPICS[(idx + 1) % TOPICS.length];
  const m = file.meta;
  const c = head.change;
  return html`<article class="topic topic-${topic.slug}">
<header class="topic-head">
  <p class="eyebrow">Indicator ${String(idx + 1).padStart(2, '0')} of ${String(TOPICS.length).padStart(2, '0')} · ${ds.period === 'week' ? 'weekly' : ds.period === 'month' ? 'monthly' : ds.period === 'quarter' ? 'quarterly' : 'yearly'} data</p>
  <h1>${topic.title}</h1>
  <p class="topic-ms" lang="ms">${topic.titleMs}</p>
  <p class="dek">${topic.dek}</p>
</header>
<section class="headline" aria-label="Latest figure">
  <div class="headline-figure">
    <p class="hl-label">${topic.headline.label}<span class="hl-ms" lang="ms">${topic.headline.labelMs}</span></p>
    <p class="hl-value"><span class="value">${head.valueText}</span>${topic.headline.per ? html` <span class="per">${topic.headline.per}</span>` : ''}</p>
    <p class="hl-period"><time datetime="${head.date}">${ds.period === 'week' ? `Week from ${head.periodText}` : head.periodLong}</time></p>
    ${c ? html`<p class="delta delta-${dirWord(c.dir)}"><span class="arrow" aria-hidden="true">${arrow(c.dir)}</span> ${c.text} <span class="vs">${c.vs}</span></p>` : ''}
  </div>
  <dl class="stamps">
    <div><dt>Data to</dt><dd>${asOfLabel(m.data_as_of)}</dd></div>
    <div><dt>Updated by source</dt><dd><time datetime="${m.last_updated.slice(0, 10)}">${dayLabel(m.last_updated)}</time></dd></div>
    <div><dt>Next update (per source)</dt><dd>${/^\d{4}-\d{2}-\d{2}/.test(m.next_update ?? '') ? dayLabel(m.next_update) : 'not announced'}</dd></div>
    <div><dt>Change picked up here</dt><dd><time datetime="${file.fetchedAt.slice(0, 10)}">${dayLabel(file.fetchedAt)}</time></dd></div>
  </dl>
</section>
<div class="figures">
${charts.map((ch) => figure({ id: `${topic.slug}-${ch.chart.id}`, spec: ch.spec, table: ch.table, chart: ch.chart, csvHref: `${base}data/${topic.slug}-${ch.chart.id}.csv`, sourceLine: sourceLine(ds, base) }))}
</div>
<section class="care" aria-labelledby="care-title">
  <h2 id="care-title">Read with care</h2>
  <ul>${topic.notes.map((n) => html`<li>${n}</li>`)}</ul>
</section>
<section class="record" aria-labelledby="record-title">
  <h2 id="record-title">Where these numbers come from</h2>
  <dl>
    <div><dt>Dataset</dt><dd><a href="${ds.page}">${ds.title}</a> (<code>${ds.id}</code>)</dd></div>
    <div><dt>Published by</dt><dd>${ds.publisher}; source codes in the API: ${m.data_source.join(', ')}</dd></div>
    <div><dt>Update frequency (per source)</dt><dd>${(m.update_frequency ?? 'unknown').toLowerCase()}</dd></div>
    <div><dt>Licence</dt><dd><a href="${LICENCE.url}">${LICENCE.name}</a></dd></div>
    <div><dt>Request this site makes</dt><dd><code class="url">${buildUrl(ds)}</code></dd></div>
    <div><dt>Downloads</dt><dd><a href="${localHref(`${base}data/${ds.id}.csv`)}">all series (CSV)</a> · <a href="${localHref(`${base}data/${ds.id}.json`)}">as committed (JSON)</a></dd></div>
  </dl>
</section>
<nav class="pager" aria-label="More indicators">
  <a class="pager-prev" href="${localHref(`${base}${prev.slug}/index.html`)}"><span class="pager-dir">Previous</span> ${prev.title}</a>
  <a class="pager-next" href="${localHref(`${base}${next.slug}/index.html`)}"><span class="pager-dir">Next</span> ${next.title}</a>
</nav>
</article>`;
}

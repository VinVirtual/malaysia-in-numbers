// Method, Limits, Release log and the 404 page.
import { html, localHref } from '../html.mjs';
import { DATASETS, LIMITS, API_DOCS, LICENCE } from '../config.mjs';
import { TOPICS } from '../topics.mjs';
import { buildUrl } from '../api.mjs';
import { dayLabel, asOfLabel } from '../../../assets/js/format.js';

export const SCHEDULE = Object.freeze({ cron: '23 1 * * *', utc: '01:23 UTC', myt: '09:23 Malaysia time' });

export function renderMethod({ files, base }) {
  const spacing = LIMITS.hostIntervalMs['api.data.gov.my'] / 1000;
  return html`<article class="prose">
<header class="page-head">
  <h1>Method</h1>
  <p class="topic-ms" lang="ms">Kaedah</p>
  <p class="dek">Every figure here is fetched from the official open data API, checked, stored in the project’s history and drawn without smoothing, filling or seasonal adjustment.</p>
</header>
<h2>The datasets</h2>
<div class="table-scroll" tabindex="0" role="region" aria-label="Datasets used">
<table class="datasets">
  <thead><tr><th scope="col">Indicator</th><th scope="col">Dataset id</th><th scope="col">Publisher</th><th scope="col">Cadence</th><th scope="col">Data to</th><th scope="col">Updated by source</th></tr></thead>
  <tbody>
  ${TOPICS.map((t) => {
    const ds = DATASETS.find((d) => d.id === t.dataset);
    const f = files[t.dataset];
    return html`<tr><th scope="row"><a href="${localHref(`${base}${t.slug}/index.html`)}">${t.title}</a></th><td><a href="${ds.page}"><code>${ds.id}</code></a></td><td>${ds.publisher}</td><td>${(f?.meta.update_frequency ?? '').toLowerCase()}</td><td>${f ? asOfLabel(f.meta.data_as_of) : '–'}</td><td>${f ? dayLabel(f.meta.last_updated) : '–'}</td></tr>`;
  })}
  </tbody>
</table>
</div>
<p>All eight are published under <a href="${LICENCE.url}">${LICENCE.name}</a> on <a href="https://data.gov.my/">data.gov.my</a> and <a href="https://open.dosm.gov.my/">OpenDOSM</a>. Each was chosen because it is still updated on schedule (checked against the API’s own <code>last_updated</code> and <code>next_update</code> fields on 24 November 2026) and because it says something most people care about: prices, jobs, output, trade, the currency, power use and population.</p>

<h2>How the data is fetched</h2>
<ul>
  <li>Once a day at ${SCHEDULE.utc} (${SCHEDULE.myt}) a GitHub Actions job asks the <a href="${API_DOCS}">data.gov.my API</a> for each dataset: <strong>one request per dataset, eight a run</strong>, with <code>meta=true</code> so the reply carries the source’s own dates.</li>
  <li>The API allows four requests a minute. Requests are spaced ${spacing} seconds apart; if the API still answers “too many requests”, the job waits as long as it is told (up to ${LIMITS.maxRetryAfterMs / 1000} s) and tries once more.</li>
  <li>Each run is capped at ${LIMITS.maxRequests} requests, ${LIMITS.maxBytes / 1024 / 1024} MB in total, ${LIMITS.maxResponseBytes / 1024 / 1024} MB per reply, ${LIMITS.timeoutMs / 1000} s per request and ${LIMITS.wallClockMs / 60000} minutes overall. HTTPS only, one allowed host, redirects refused, no key, no cookies, and a plain User-Agent naming this site.</li>
  <li>Replies are cached for ${LIMITS.cacheTtlMs / 3_600_000} hours on the machine that runs the job, so a re-run asks nobody.</li>
  <li>Every reply is checked before use: it must name the dataset asked for, carry the source’s dates, have a real calendar date on every row and never give two values for one date. Empty values are left out, never turned into zero. A reply that would delete figures already stored, or end earlier than before, is refused as broken. A dataset that fails keeps its last good figures, and the day’s run is marked as failed.</li>
</ul>
<p>The requests, exactly as sent:</p>
<ul class="urls">${DATASETS.map((d) => html`<li><code class="url">${buildUrl(d)}</code></li>`)}</ul>

<h2>History</h2>
<p>Each dataset is stored as a compact file in the project’s Git repository and only rewritten when the source changed something. Every new or revised value therefore leaves a commit, and the <a href="${localHref(`${base}log/index.html`)}">release log</a> records when this site saw it, how many values were new and how many were revised. Revisions are normal: statistics offices update recent figures as fuller data arrive.</p>

<h2>What is computed here</h2>
<ul>
  <li><strong>Change</strong> on each card compares the latest value with the one before (fuel, inflation, jobs, GDP growth, the ringgit, population) or with the same month a year before, for figures with strong seasons (exports, electricity). Rates change in <em>percentage points</em> (pp), prices in <em>sen</em>, amounts in <em>per cent</em>.</li>
  <li><strong>Trade balance</strong> is exports minus imports for the same month. Nothing else is derived; growth rates and inflation are the publishers’ own.</li>
  <li><strong>Colour</strong> shows direction only: amber for up, teal for down, always with an arrow and a sign. It does not mean good or bad.</li>
  <li>Numbers are shown as published, rounded for display only. The CSV downloads carry the full values.</li>
</ul>

<h2>Reading the charts</h2>
<p>Every chart is drawn as SVG when the site is built, so it shows without JavaScript. With JavaScript, it is redrawn at the width of your screen, hovering shows the values under the pointer, and line and bar charts can be focused with the Tab key and read with the arrow keys (Home and End jump to the ends), with the values announced to screen readers. Horizontal bar charts print every value next to its bar, so they are read as they are. Each chart has the full table behind it and a CSV download. Charts with several series have a legend and, where there is room, labels at the line ends; one chart never has two scales.</p>

<h2>Feeds</h2>
<p><a href="${localHref(`${base}feed.json`)}">feed.json</a> is a JSON Feed 1.1 with one item per dataset release, so a feed reader shows each new figure once. <a href="${localHref(`${base}latest.json`)}">latest.json</a> is the same latest values as plain JSON for scripts.</p>
</article>`;
}

export function renderLimits() {
  return html`<article class="prose">
<header class="page-head">
  <h1>Limits</h1>
  <p class="topic-ms" lang="ms">Had dan kekangan</p>
  <p class="dek">What this site does not do, and where its numbers can mislead.</p>
</header>
<ul class="limits">
  <li><strong>Not an official source.</strong> This is an independent site that republishes open data. For anything that matters, check the publisher’s own release; every chart links to it.</li>
  <li><strong>Figures get revised.</strong> GDP, labour force, trade and electricity figures are revised after first release. The site always shows the latest version; earlier versions are in the project’s history and the release log counts revisions, but the pages do not show them side by side.</li>
  <li><strong>Up to a day late.</strong> The site checks once a day, so a release can take until the next run (${SCHEDULE.myt}) to appear. If the API is down or refuses a request, the previous figures stay up; the failure turns the day’s run red in the project’s Actions log but is not shown on the site. “Change picked up here” on each page is the last day this site saw new or revised figures for it, not the last day it looked.</li>
  <li><strong>The API’s dates are taken as given.</strong> “Updated by source” and “Next update” are the API’s own <code>last_updated</code> and <code>next_update</code> fields. Its time zone is not stated, so only the dates are shown.</li>
  <li><strong>No seasonal adjustment, no inflation adjustment.</strong> Trade values are in current ringgit. Exports and electricity use have seasons, which is why their cards compare with the same month a year before.</li>
  <li><strong>Electricity data lag.</strong> The source publishes consumption about four months after the month ends.</li>
  <li><strong>Exchange rates are monthly averages</strong> of Bank Negara Malaysia’s rates, not daily or end-of-day rates.</li>
  <li><strong>Missing on purpose.</strong> The Overnight Policy Rate is not in the API’s interest-rate dataset, so it is not shown. State population (last updated 2023) and daily births (stopped in July 2023) were left out because they are no longer kept up to date.</li>
  <li><strong>Colour is direction, not judgement.</strong> A falling fuel price and a falling GDP growth rate get the same colour.</li>
  <li><strong>Malay labels.</strong> CPI division names are DOSM’s own Malay names. The other Malay headings were written for this site and have not been reviewed by a professional translator.</li>
  <li><strong>Tested in Chromium</strong> at phone and desktop widths, in light and dark themes and with reduced motion. Other browsers were not tested by the build.</li>
</ul>
</article>`;
}

export function renderLog({ releases, base }) {
  const rows = [...releases].reverse();
  return html`<article class="prose">
<header class="page-head">
  <h1>Release log</h1>
  <p class="topic-ms" lang="ms">Log keluaran</p>
  <p class="dek">One line each time a run found new or revised values. The first lines are the first fetch of each dataset’s history.</p>
</header>
<div class="table-scroll" tabindex="0" role="region" aria-label="Release log">
<table class="log">
  <thead><tr><th scope="col">Seen</th><th scope="col">Indicator</th><th scope="col">Data to</th><th scope="col" class="num">New</th><th scope="col" class="num">Revised</th><th scope="col" class="num">Removed</th></tr></thead>
  <tbody>
  ${rows.map((r) => {
    const t = TOPICS.find((x) => x.dataset === r.id);
    return html`<tr><th scope="row"><time datetime="${r.at.slice(0, 10)}">${dayLabel(r.at)}</time></th><td><a href="${localHref(`${base}${t.slug}/index.html`)}">${t.title}</a></td><td>${asOfLabel(r.data_as_of)}</td><td class="num">${r.added ?? 0}</td><td class="num">${r.revised ?? 0}</td><td class="num">${r.removed ?? 0}</td></tr>`;
  })}
  </tbody>
</table>
</div>
<p>The full log is <a href="${localHref(`${base}data/releases.jsonl`)}">releases.jsonl</a> (one JSON object per line).</p>
</article>`;
}

export function render404() {
  return html`<article class="prose">
<header class="page-head">
  <h1>No figure here</h1>
  <p class="dek">That page does not exist. The <a href="${localHref('/index.html')}">indicators</a> are on the front page.</p>
</header>
</article>`;
}

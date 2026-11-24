// The front page: an edition line, a lead written from the latest figures, a ticker and
// the bento of eight indicators, then the latest releases.
import { html, raw, localHref } from '../html.mjs';
import { TOPICS } from '../topics.mjs';
import { datasetById } from '../config.mjs';
import { sparkSvg } from '../../../assets/js/chart-core.js';
import { fixed, periodLabel, dayLabel, asOfLabel } from '../../../assets/js/format.js';
import { myt } from './layout.mjs';

const arrow = (dir) => (dir > 0 ? '▲' : dir < 0 ? '▼' : '■');
const dirWord = (dir) => (dir > 0 ? 'up' : dir < 0 ? 'down' : 'flat');

// Sentences built only from the numbers on the page, with no adjectives about them.
export function leadSentences(h) {
  const s = [];
  const f = h.fuel;
  if (f) {
    const sen = f.change ? Math.round((f.value - f.prevValue) * 100) : 0;
    const moved = !f.change ? '' : sen === 0 ? ', unchanged from the week before' : `, ${Math.abs(sen)} sen ${sen < 0 ? 'less' : 'more'} than the week before`;
    s.push(`Unsubsidised RON95 costs ${f.valueText} a litre in the week from ${periodLabel(f.date, 'week')}${moved}.`);
  }
  const i = h.inflation;
  if (i) s.push(i.value >= 0 ? `Consumer prices in ${i.periodLong} were ${fixed(i.value, 1)}% higher than a year earlier.` : `Consumer prices in ${i.periodLong} were ${fixed(-i.value, 1)}% lower than a year earlier.`);
  const g = h.gdp;
  if (g) s.push(g.value >= 0 ? `The economy grew ${fixed(g.value, 1)}% in ${g.periodText} on a year before.` : `The economy shrank ${fixed(-g.value, 1)}% in ${g.periodText} on a year before.`);
  const j = h.jobs;
  if (j) s.push(`${fixed(j.value, 1)}% of the labour force was out of work in ${j.periodLong}.`);
  return s;
}

function card(t, h, file, i) {
  const ds = datasetById(t.dataset);
  const c = h.change;
  return html`<article class="card card-${t.size} card-${t.slug}" aria-labelledby="card-${t.slug}">
  <p class="card-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</p>
  <h2 class="card-title" id="card-${t.slug}"><a href="${localHref(`${t.slug}/index.html`)}">${t.title}</a></h2>
  <p class="card-ms" lang="ms">${t.titleMs}</p>
  <p class="card-figure"><span class="value">${h.valueText}</span>${t.headline.per ? html` <span class="per">${t.headline.per}</span>` : ''}</p>
  <p class="card-what">${t.headline.label} · <time datetime="${h.date}">${h.periodText}</time></p>
  ${c ? html`<p class="delta delta-${dirWord(c.dir)}"><span class="arrow" aria-hidden="true">${arrow(c.dir)}</span> ${c.text} <span class="vs">${c.vs}</span></p>` : html`<p class="delta delta-flat">No earlier figure to compare with</p>`}
  <div class="card-spark">${raw(sparkSvg(h.spark, { width: t.size === 'xl' ? 520 : 240, height: t.size === 'xl' ? 96 : 48, type: t.headline.sparkType ?? 'line', c: 1 }))}</div>
  <p class="stamp">${ds.publisher.split(' (')[0]} · updated <time datetime="${file.meta.last_updated.slice(0, 10)}">${dayLabel(file.meta.last_updated)}</time></p>
</article>`;
}

function ticker(heads) {
  const items = TOPICS.filter((t) => heads[t.slug]).map((t) => {
    const h = heads[t.slug];
    return html`<li><span class="tk-name">${t.title}</span> <span class="tk-val">${h.valueText}</span>${h.change ? html` <span class="tk-d delta-${dirWord(h.change.dir)}">${arrow(h.change.dir)} ${h.change.text}</span>` : ''}</li>`;
  });
  // Shown twice so the loop is seamless; hidden from assistive tech (the cards say it all).
  return html`<div class="ticker" aria-hidden="true"><ul class="ticker-track">${items}${items}</ul></div>`;
}

function stripes() {
  // Fourteen stripes, as on the Jalur Gemilang; drawn in the page's own ink, not the flag's colours.
  const rows = Array.from({ length: 14 }, (_, i) => html`<rect class="stripe${i % 2 ? ' alt' : ''}" x="0" y="${i * 10}" width="100" height="10" data-i="${i}"/>`);
  return html`<svg class="stripes" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true" focusable="false">${rows}</svg>`;
}

export function renderHome({ heads, files, releases, builtAt }) {
  const ed = myt(builtAt);
  const lead = leadSentences(heads);
  const recent = [...releases].reverse().slice(0, 8);
  return html`<section class="hero" aria-labelledby="hero-title">
  ${stripes()}
  <div class="hero-text">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span> Edition of <time datetime="${ed.iso}">${ed.long}</time></p>
    <h1 id="hero-title" class="hero-title"><span class="ht-a">Malaysia</span> <span class="ht-b">in Numbers</span></h1>
    <p class="hero-ms" lang="ms">Malaysia dalam Angka: angka rasmi terkini, disemak setiap hari.</p>
    <p class="lead">${lead.join(' ')}</p>
  </div>
</section>
${ticker(heads)}
<section class="bento" aria-label="Indicators">
  ${TOPICS.map((t, i) => (heads[t.slug] ? card(t, heads[t.slug], files[t.dataset], i) : ''))}
</section>
<section class="releases" aria-labelledby="releases-title">
  <div class="releases-head">
    <h2 id="releases-title">What changed lately</h2>
    <p>Each line is a day this site found new or revised figures. <a href="${localHref('log/index.html')}">Full release log</a></p>
  </div>
  <ol class="release-list">
    ${recent.map((r) => {
      const t = TOPICS.find((x) => x.dataset === r.id);
      return html`<li><time datetime="${r.at.slice(0, 10)}">${dayLabel(r.at)}</time> <a href="${localHref(`${t.slug}/index.html`)}">${t.title}</a> <span class="rel-what">data to ${asOfLabel(r.data_as_of)}${r.added ? ` · ${r.added} new values` : ''}${r.revised ? ` · ${r.revised} revised` : ''}</span></li>`;
    })}
  </ol>
</section>`;
}

// One chart as a <figure>: heading, legend, the SVG (drawn at build time), a keyboard and
// pointer reading layer added by app.js, the data table behind it and a CSV download.
import { html, raw, localHref } from '../html.mjs';
import { renderChart } from '../../../assets/js/chart-core.js';

export const CHART_W = 720;
export const CHART_H = 300;

// What the page script needs to redraw the chart at its real width. Kept short.
export function chartData(spec) {
  return JSON.stringify({
    type: spec.type, fmt: spec.fmt, period: spec.period, zero: spec.zero || undefined, title: spec.title, when: spec.when, highlight: spec.highlight,
    x: spec.x, series: spec.series.map((s) => ({ label: s.label, short: s.short, c: s.c, v: s.v })),
  });
}

export function figure({ id, spec, table, chart, csvHref, sourceLine }) {
  const legend = spec.type !== 'hbar' && spec.series.length > 1;
  const interactive = spec.type !== 'hbar';
  return html`<figure class="figure figure-${spec.type}" id="${id}" data-chart="${chartData(spec)}" data-chart-id="${id}-svg">
  <figcaption class="fig-head">
    <h2 class="fig-title">${chart.title}</h2>
    <p class="fig-ms" lang="ms">${chart.titleMs}</p>
  </figcaption>
  ${legend ? html`<ul class="legend" aria-label="Legend">${spec.series.map((s) => html`<li><span class="key s${s.c}" aria-hidden="true"></span>${s.label}</li>`)}</ul>` : ''}
  <div class="plot${spec.type === 'hbar' ? ' plot-auto' : ''}"${interactive ? html` tabindex="0" role="group" aria-roledescription="interactive chart" aria-label="${spec.title}. Use the left and right arrow keys to read values; Home and End jump to the ends." aria-describedby="${id}-svg-d"` : ''}>
    ${raw(renderChart(spec, { width: CHART_W, height: CHART_H, id: `${id}-svg` }))}
    ${interactive ? html`<div class="tip" hidden aria-hidden="true"></div>` : ''}
  </div>
  ${interactive ? html`<p class="readout" aria-live="polite" data-readout></p>` : ''}
  <div class="fig-foot">
    <p class="fig-source">${sourceLine}</p>
    <p class="fig-actions"><a class="btn-csv" href="${localHref(csvHref)}" download>Download CSV</a></p>
  </div>
  <details class="table-wrap">
    <summary>Show the data table <span class="count">(${table.rows.length} rows)</span></summary>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Data table: ${chart.title}">
      <table>
        <caption class="sr-only">${spec.title}</caption>
        <thead><tr>${table.head.map((h, i) => html`<th scope="col"${i ? html` class="num"` : ''}>${h}</th>`)}</tr></thead>
        <tbody>${table.rows.map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td class="${typeof c === 'string' && /^[A-Za-z]/.test(c) && !/^RM/.test(c) ? '' : 'num'}">${c}</td>`))}</tr>`)}</tbody>
      </table>
    </div>
  </details>
</figure>`;
}

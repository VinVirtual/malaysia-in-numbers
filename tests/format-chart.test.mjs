// Number formats, changes, period labels and the SVG chart engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, change, periodLabel, asOfLabel, fixed, FORMATS, stepDp } from '../assets/js/format.js';
import { niceTicks, timeTicks, renderChart, layoutChart, describe, spreadLabels, nearestIndex, sparkSvg, barPath, esc } from '../assets/js/chart-core.js';

test('formats read the way Malaysian figures are written', () => {
  assert.equal(fmt('rm2', 3.72), 'RM3.72');
  assert.equal(fmt('pct1', 1.9), '1.9%');
  assert.equal(fmt('pct1', -2.9), '−2.9%');
  assert.equal(fmt('rate4', 4.0818), '4.0818');
  assert.equal(fmt('rmbn', 215112665290), 'RM215.1 bn');
  assert.equal(fmt('rmbn_m', 467403.569), 'RM467.4 bn');
  assert.equal(fmt('gwh', 17075.87), '17,076 GWh');
  assert.equal(fmt('people_k', 34389.4), '34.39 million');
  assert.equal(fmt('people_k', 237.1), '237.1 thousand');
  assert.equal(fmt('pct1', null), '–');
  assert.throws(() => fmt('furlongs', 1), /unknown format/);
});

test('fixed groups thousands and never prints minus zero', () => {
  assert.equal(fixed(1234567.891, 2), '1,234,567.89');
  assert.equal(fixed(-0.04, 1), '0.0');
  assert.equal(fixed(-1234.5, 0), '−1,235');
  assert.equal(fixed(NaN, 1), '–');
});

test('changes: percentage points, sen and per cent, with direction', () => {
  assert.deepEqual(change('pp', 1.9, 1.8).text, '+0.1 pp');
  assert.equal(change('pp', 2.9, 2.9).dir, 0);
  assert.equal(change('pp', 2.9, 2.9).text, '0.0 pp');
  assert.equal(change('sen', 3.72, 3.87).text, '−15 sen');
  assert.equal(change('sen', 3.72, 3.87).dir, -1);
  assert.equal(change('sen', 4.0, 3.87).text, '+13 sen');
  assert.equal(change('pct', 110, 100).text, '+10.0%');
  assert.equal(change('pct', 1, 0), null, 'no per cent change from zero');
  assert.equal(change('pp', 1, null), null);
  assert.throws(() => change('ratio', 1, 2), /unknown change mode/);
});

test('tick labels carry the decimals their step needs (2.5 is never shown as 3)', () => {
  const t = niceTicks(-5, 7.4, 5);
  assert.equal(t.step, 2.5);
  assert.deepEqual(t.ticks.map((v) => FORMATS.pct1.axis(v, t.step)), ['−5.0%', '−2.5%', '0.0%', '2.5%', '5.0%', '7.5%']);
  assert.equal(FORMATS.rmbn.axis(2.5e9, 2.5e9), 'RM2.5bn');
  assert.equal(FORMATS.rmbn.axis(50e9, 50e9), 'RM50bn');
  assert.equal(FORMATS.pct1.axis(68.25, 0.25), '68.25%');
  assert.equal(FORMATS.rate4.axis(4.025, 0.025), '4.025');
  assert.equal(FORMATS.people_k.axis(25000, 5000), '25m');
  assert.equal(stepDp(0.0001), 4);
  assert.equal(stepDp(1e-7), 7);
});

test('a tiny change rounds before its sign is chosen', () => {
  assert.equal(change('pp', 2.94, 2.9).text, '0.0 pp');
  assert.equal(change('pp', 2.86, 2.9).text, '0.0 pp');
  assert.equal(change('pct', 100.01, 100).text, '0.0%');
});

test('a series with no values gets no end label or NaN coordinates', () => {
  const s = { type: 'line', fmt: 'pct1', period: 'month', title: 't', x: ['2026-01-01', '2026-02-01'], series: [{ label: 'A', c: 1, v: [1, 2] }, { label: 'B', c: 2, v: [null, null] }] };
  assert.doesNotMatch(renderChart(s, { width: 600, height: 300 }), /NaN/);
});

test('period labels for each cadence', () => {
  assert.equal(periodLabel('2026-11-19', 'week'), '19 Nov 2026');
  assert.equal(periodLabel('2026-10-01', 'month'), 'Oct 2026');
  assert.equal(periodLabel('2026-10-01', 'month', true), 'October 2026');
  assert.equal(periodLabel('2026-07-01', 'quarter'), 'Q3 2026');
  assert.equal(periodLabel('2026-01-01', 'year'), '2026');
  assert.equal(periodLabel('garbage', 'month'), 'garbage');
});

test('the API data_as_of forms are labelled', () => {
  assert.equal(asOfLabel('2026-10'), 'Oct 2026');
  assert.equal(asOfLabel('2026-Q3'), 'Q3 2026');
  assert.equal(asOfLabel('2026'), '2026');
  assert.equal(asOfLabel('2026-11-19 00:01'), '19 Nov 2026');
  assert.equal(asOfLabel(null), '');
});

test('niceTicks gives round steps that cover the data', () => {
  const t = niceTicks(-2.9, 4.9, 5);
  assert.equal(t.step, 2);
  assert.deepEqual(t.ticks, [-4, -2, 0, 2, 4, 6]);
  const flat = niceTicks(1.99, 1.99, 5);
  assert.ok(flat.lo < 1.99 && flat.hi > 1.99);
  assert.ok(niceTicks(0, 215e9, 5).ticks.every((v) => Number.isInteger(v / 50e9)));
  assert.deepEqual(niceTicks(NaN, 1).ticks, [0, 1]);
});

test('timeTicks uses years for long spans and months for a single year, and fits the width', () => {
  const y = timeTicks(Date.UTC(2015, 0, 1), Date.UTC(2026, 9, 1), 700);
  assert.equal(y[0].label, '2015');
  assert.ok(y.length >= 6 && y.length <= 12);
  const narrow = timeTicks(Date.UTC(2015, 0, 1), Date.UTC(2026, 9, 1), 200);
  assert.ok(narrow.length <= 5);
  const m = timeTicks(Date.UTC(2025, 10, 20), Date.UTC(2026, 10, 19), 700);
  assert.match(m[0].label, /^[A-Z][a-z]{2} ’\d\d$/);
});

const line = {
  type: 'line', fmt: 'pct1', period: 'month', title: 'Test <chart>',
  x: ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'],
  series: [{ label: 'A & B', c: 1, v: [1, 2, null, 4] }, { label: 'C', c: 2, v: [2, 1, 1, 0] }],
};

test('a line chart is an accessible SVG image with escaped text', () => {
  const svg = renderChart(line, { width: 600, height: 300, id: 'c1' });
  assert.match(svg, /^<svg class="chart-svg"[^>]*role="img"[^>]*aria-labelledby="c1-t c1-d"/);
  assert.match(svg, /<title id="c1-t">Test &lt;chart&gt;<\/title>/);
  assert.match(svg, /<desc id="c1-d">Line chart, 4 months\. A &amp; B went from 1\.0% in Jan 2026 to 4\.0% in Apr 2026/);
  assert.ok(!svg.includes('<chart>'));
  assert.equal((svg.match(/class="line s/g) || []).length, 2);
});

test('a gap in a series breaks the line instead of joining across it', () => {
  const svg = renderChart(line, { width: 600, height: 300 });
  const d = /class="line s1" d="([^"]+)"/.exec(svg)[1];
  assert.equal((d.match(/M/g) || []).length, 2);
});

test('up to four series get direct labels at the line ends; five do not', () => {
  assert.match(renderChart(line, { width: 600, height: 300 }), /class="direct"/);
  const five = { ...line, series: Array.from({ length: 5 }, (_, i) => ({ label: `S${i}`, c: i + 1, v: [1, 2, 3, i] })) };
  assert.doesNotMatch(renderChart(five, { width: 600, height: 300 }), /class="direct"/);
  assert.doesNotMatch(renderChart(line, { width: 360, height: 300 }), /class="direct"/, 'no room on a phone');
});

test('bars: negative values hang below the zero line and are marked', () => {
  const bar = { type: 'bar', fmt: 'pct1', period: 'quarter', zero: true, title: 'g', x: ['2020-01-01', '2020-04-01', '2020-07-01'], series: [{ label: 'g', c: 1, v: [0.7, -17.1, -2.6] }] };
  const svg = renderChart(bar, { width: 600, height: 300 });
  assert.equal((svg.match(/class="bar s1 neg"/g) || []).length, 2);
  assert.match(svg, /class="zero"/);
});

test('barPath rounds only the far end and keeps the base square', () => {
  const up = barPath(10, 8, 100, 40, 3);
  assert.match(up, /^M10 100V43Q10 40 13 40H15Q18 40 18 43V100Z$/);
  const down = barPath(10, 8, 100, 160, 3);
  assert.match(down, /^M10 100V157/);
  assert.equal(barPath(0, 8, 50, 50.2), 'M0 50h8');
});

test('horizontal bars list categories with their values and highlight one row', () => {
  const h = { type: 'hbar', fmt: 'pct1', period: 'month', title: 'By division', when: 'October 2026', highlight: 0, x: ['All items', 'Transport', 'Clothing'], series: [{ label: 'yoy', c: 1, v: [1.9, 4.2, -0.3] }] };
  const svg = renderChart(h, { width: 600 });
  assert.match(svg, /<g class="row hl" data-i="0">/);
  assert.match(svg, />4\.2%</);
  assert.match(svg, /class="bar s1 neg"/);
  assert.match(describe(h), /Bar chart of yoy, October 2026: All items 1\.9%; Transport 4\.2%; Clothing −0\.3%\./);
  assert.equal(layoutChart(h, 600, 0).height, 6 + 6 + 28 * 3);
});

test('end labels are spread apart and kept inside the plot', () => {
  const items = [{ y: 100 }, { y: 101 }, { y: 103 }, { y: 299 }];
  spreadLabels(items, 10, 300);
  const ys = items.map((i) => i.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 14 - 1e-9);
  assert.ok(ys.at(-1) <= 300 && ys[0] >= 10);
});

test('nearestIndex finds the data point under the pointer', () => {
  const L = layoutChart(line, 600, 300);
  assert.equal(nearestIndex(L, 4, L.xs(2) + 3), 2);
  assert.equal(nearestIndex(L, 4, -50), 0);
  assert.equal(nearestIndex(L, 4, 9999), 3);
});

test('every format has value, axis and unit', () => {
  for (const [k, f] of Object.entries(FORMATS)) {
    assert.equal(typeof f.value(1), 'string', k);
    assert.equal(typeof f.axis(1, 1), 'string', k);
    assert.ok(f.unit.length > 3, k);
  }
});

test('sparklines are decorative and need two points', () => {
  assert.match(sparkSvg([1, 2, 3]), /aria-hidden="true"/);
  assert.equal(sparkSvg([1]), '');
  assert.equal((sparkSvg([1, -2, 3], { type: 'bar' }).match(/neg/g) || []).length, 1);
});

test('the shared escaper covers quotes', () => {
  assert.equal(esc(`"'<&>`), '&quot;&#39;&lt;&amp;&gt;');
});

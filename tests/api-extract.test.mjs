// The API boundary: how requests are built, and how replies are checked and reshaped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATASETS, datasetById, LIMITS } from '../scripts/lib/config.mjs';
import { buildUrl, parseResponse, parseMeta, DataError } from '../scripts/lib/api.mjs';
import { extractSeries, cleanNumber, isIsoDay, slugKey } from '../scripts/lib/extract.mjs';
import { fixtureText, fixtureJson } from './helpers.mjs';

test('every configured dataset builds an https URL with a trailing slash, meta and sort', () => {
  for (const ds of DATASETS) {
    const u = new URL(buildUrl(ds));
    assert.equal(u.protocol, 'https:');
    assert.equal(u.host, 'api.data.gov.my');
    assert.match(u.pathname, /^\/(data-catalogue|opendosm)\/$/, 'without the slash the API answers 301');
    assert.equal(u.searchParams.get('id'), ds.id);
    assert.equal(u.searchParams.get('meta'), 'true');
    assert.equal(u.searchParams.get('sort'), 'date');
    assert.equal(u.searchParams.get('limit'), String(LIMITS.rowLimit));
  }
});

test('filters, includes and start dates are passed in the API syntax', () => {
  const u = new URL(buildUrl(datasetById('exchangerates')));
  assert.equal(u.searchParams.get('filter'), 'avg@indicator');
  assert.equal(u.searchParams.get('include'), 'date,usd,sgd,eur,cny,gbp,jpy');
  assert.equal(u.searchParams.get('date_start'), '2015-01-01@date');
  assert.equal(new URL(buildUrl(datasetById('fuelprice'))).searchParams.get('date_start'), null);
});

test('buildUrl refuses bad ids, endpoints, parameters and dates', () => {
  const base = datasetById('lfs_month');
  assert.throws(() => buildUrl({ ...base, id: '../etc' }), DataError);
  assert.throws(() => buildUrl({ ...base, id: 'A' }), /bad dataset id/);
  assert.throws(() => buildUrl({ ...base, endpoint: 'gtfs-realtime' }), /bad endpoint/);
  assert.throws(() => buildUrl({ ...base, query: { callback: 'x' } }), /unsupported query parameter/);
  assert.throws(() => buildUrl({ ...base, query: { filter: 'a&b=c' } }), /bad filter value/);
  assert.throws(() => buildUrl({ ...base, from: '2015-1-1' }), /bad start date/);
});

test('dataset ids are unique and every dataset has a period, page and extractor', () => {
  const ids = DATASETS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of DATASETS) {
    assert.ok(['week', 'month', 'quarter', 'year'].includes(d.period), d.id);
    assert.match(d.page, /^https:\/\/(open\.dosm\.gov\.my|data\.gov\.my)\/data-catalogue\//);
    assert.ok(d.extract.length > 0);
  }
});

test('parseMeta keeps the source dates and checks the dataset id', () => {
  const m = parseMeta(fixtureJson('fuelprice').meta, 'fuelprice');
  assert.equal(m.update_frequency, 'WEEKLY');
  assert.deepEqual(m.data_source, ['MOF']);
  assert.throws(() => parseMeta({ ...fixtureJson('fuelprice').meta, catalogue_id: 'births' }, 'fuelprice'), /another dataset/);
  assert.throws(() => parseMeta({ catalogue_id: 'fuelprice' }, 'fuelprice'), /lacks data_as_of/);
  assert.throws(() => parseMeta({ data_as_of: '2026', last_updated: 'yesterday' }, 'fuelprice'), /not a date/);
  assert.throws(() => parseMeta(null, 'fuelprice'), /no meta/);
});

test('parseResponse rejects what is not a usable reply', () => {
  const meta = fixtureJson('lfs_month').meta;
  assert.throws(() => parseResponse('<html>', 'lfs_month'), /not JSON/);
  assert.throws(() => parseResponse('[]', 'lfs_month'), /expected \{meta, data\}/);
  assert.throws(() => parseResponse({ status: 429, meta, data: [] }, 'lfs_month'), /API error 429/);
  assert.throws(() => parseResponse({ meta, data: 'x' }, 'lfs_month'), /no data array/);
  assert.throws(() => parseResponse({ meta, data: [] }, 'lfs_month'), /no rows/);
  assert.throws(() => parseResponse({ meta, data: [[1, 2]] }, 'lfs_month'), /not an object/);
});

test('a reply that reaches the row limit is refused instead of silently cut', () => {
  const meta = fixtureJson('lfs_month').meta;
  const data = Array.from({ length: LIMITS.rowLimit }, () => ({ date: '2026-01-01' }));
  assert.throws(() => parseResponse({ meta, data }, 'lfs_month'), /row limit/);
});

test('isIsoDay accepts only real calendar dates', () => {
  assert.ok(isIsoDay('2024-02-29'));
  assert.ok(!isIsoDay('2023-02-29'));
  assert.ok(!isIsoDay('2026-13-01'));
  assert.ok(!isIsoDay('2026-10'));
  assert.ok(!isIsoDay('2026-10-01T00:00'));
  assert.ok(!isIsoDay(null));
});

test('cleanNumber removes float noise but keeps every real digit', () => {
  assert.equal(cleanNumber(-0.1499999999999999), -0.15);
  assert.equal(cleanNumber(215112665290), 215112665290);
  assert.equal(cleanNumber(17075.874964028048), 17075.874964028);
  assert.equal(cleanNumber('4.72'), 4.72);
  assert.equal(cleanNumber(-0), 0);
  for (const bad of [null, undefined, NaN, Infinity, '', 'abc', '1e5x', {}, true]) assert.equal(cleanNumber(bad), null);
});

test('slugKey makes safe series keys from source values', () => {
  assert.equal(slugKey('bumi_malay'), 'bumi_malay');
  assert.equal(slugKey('Local Commercial'), 'local_commercial');
  assert.equal(slugKey('<script>'), 'script');
  assert.equal(slugKey('01'), '01');
  assert.equal(slugKey('x'.repeat(80)).length, 40);
});

test('wide extraction: fuel prices become one series per fuel', () => {
  const ds = datasetById('fuelprice');
  const { rows } = parseResponse(fixtureText('fuelprice'), 'fuelprice');
  const { series } = extractSeries(ds, rows);
  assert.deepEqual(Object.keys(series).sort(), ['diesel', 'diesel_east', 'ron95', 'ron95_budi95', 'ron97']);
  assert.deepEqual(series.ron95.at(-1), ['2026-11-19', 3.72]);
  for (const s of Object.values(series)) for (let i = 1; i < s.length; i++) assert.ok(s[i][0] > s[i - 1][0]);
});

test('long extraction: CPI divisions keyed by prefix, month-on-month only for overall', () => {
  const ds = datasetById('cpi_headline_inflation');
  const { rows } = parseResponse(fixtureText('cpi_headline_inflation'), ds.id);
  const { series } = extractSeries(ds, rows);
  assert.equal(Object.keys(series).filter((k) => k.startsWith('yoy_')).length, 14);
  assert.deepEqual(Object.keys(series).filter((k) => k.startsWith('mom_')), ['mom_overall']);
  assert.deepEqual(series.yoy_overall.at(-1), ['2026-10-01', 1.9]);
});

test('long extraction honours a key allow-list', () => {
  const ds = datasetById('gdp_qtr_real');
  const rows = [...parseResponse(fixtureText('gdp_qtr_real'), ds.id).rows, { date: '2026-07-01', series: 'surprise', value: 1 }];
  assert.deepEqual(Object.keys(extractSeries(ds, rows).series).sort(), ['abs', 'growth_qoq', 'growth_yoy']);
});

test('every fixture extracts cleanly', () => {
  for (const ds of DATASETS) {
    const { rows } = parseResponse(fixtureText(ds.id), ds.id);
    const { series, skipped } = extractSeries(ds, rows);
    assert.ok(Object.keys(series).length > 0, ds.id);
    assert.equal(skipped, 0, ds.id);
  }
});

test('rows with bad dates are skipped and counted; null values are left out, not zero', () => {
  const ds = datasetById('lfs_month');
  const rows = [
    { date: '2026-09-01', u_rate: 2.9, p_rate: null },
    { date: 'September', u_rate: 3 },
    { date: '2026-08-01', u_rate: '2.9' },
  ];
  const { series, skipped } = extractSeries(ds, rows);
  assert.equal(skipped, 1);
  assert.deepEqual(series.u_rate, [['2026-08-01', 2.9], ['2026-09-01', 2.9]]);
  assert.equal(series.p_rate, undefined);
});

test('two different values for one date are an error; repeats of the same value are not', () => {
  const ds = datasetById('lfs_month');
  assert.throws(() => extractSeries(ds, [{ date: '2026-09-01', u_rate: 2.9 }, { date: '2026-09-01', u_rate: 3.1 }]), /two different values/);
  assert.equal(extractSeries(ds, [{ date: '2026-09-01', u_rate: 2.9 }, { date: '2026-09-01', u_rate: 2.9 }]).series.u_rate.length, 1);
});

test('no usable values, or an unknown extractor, is an error', () => {
  assert.throws(() => extractSeries(datasetById('lfs_month'), [{ date: '2026-09-01', other: 1 }]), /no usable values/);
  assert.throws(() => extractSeries({ id: 'x', extract: [{ type: 'pivot' }] }, [{ date: '2026-09-01' }]), /unknown extract type/);
});

test('a hostile key value cannot become an unsafe series key', () => {
  const ds = datasetById('electricity_consumption');
  const { series } = extractSeries(ds, [{ date: '2026-06-01', sector: '__proto__', consumption: 5 }, { date: '2026-06-01', sector: 'total', consumption: 9 }]);
  assert.deepEqual(Object.keys(series).sort(), ['proto', 'total']);
  assert.equal(Object.getPrototypeOf(series), Object.prototype);
});

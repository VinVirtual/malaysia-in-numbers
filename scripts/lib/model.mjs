// From committed dataset files to what the pages show: headline numbers with their change,
// and chart specs (with the table and CSV rows behind each chart).
import { CPI_DIVISIONS } from './topics.mjs';
import { datasetById } from './config.mjs';
import { change, fmt, periodLabel, FORMATS } from '../../assets/js/format.js';

export function lastPoint(points) {
  return points?.length ? points[points.length - 1] : null;
}

function yearBefore(iso) {
  return `${String(Number(iso.slice(0, 4)) - 1).padStart(4, '0')}${iso.slice(4)}`;
}

// The point to compare the latest with: the one before, or the same date a year earlier.
export function comparePoint(points, compare) {
  if (!points || points.length < 2) return null;
  const [d] = points[points.length - 1];
  if (compare === 'year') return points.find((p) => p[0] === yearBefore(d)) ?? null;
  return points[points.length - 2];
}

export function vsLabel(compare, prevDate, period) {
  if (!prevDate) return '';
  if (period === 'week') return compare === 'year' ? 'vs a year before' : 'vs the week before';
  return `vs ${periodLabel(prevDate, period)}`;
}

export function headline(topic, file) {
  const ds = datasetById(topic.dataset);
  const h = topic.headline;
  const pts = file.series[h.key];
  if (!pts?.length) throw new Error(`${topic.slug}: no series ${h.key}`);
  const [date, value] = lastPoint(pts);
  const prev = comparePoint(pts, h.compare);
  const ch = prev ? change(h.change, value, prev[1]) : null;
  return {
    slug: topic.slug,
    key: h.key,
    date,
    value,
    valueText: fmt(h.fmt, value),
    period: ds.period,
    periodText: periodLabel(date, ds.period),
    periodLong: periodLabel(date, ds.period, true),
    prevDate: prev?.[0] ?? null,
    prevValue: prev?.[1] ?? null,
    change: ch ? { ...ch, vs: vsLabel(h.compare, prev[0], ds.period) } : null,
    spark: pts.slice(-(h.spark ?? 24)).map((p) => p[1]),
    sparkDates: pts.slice(-(h.spark ?? 24)).map((p) => p[0]),
  };
}

// Line up several series on the union of their dates; missing values are null.
export function align(seriesMap, keys, last = 0) {
  const dates = [...new Set(keys.flatMap((k) => (seriesMap[k] ?? []).map((p) => p[0])))].sort();
  const x = last ? dates.slice(-last) : dates;
  const maps = keys.map((k) => new Map(seriesMap[k] ?? []));
  return { x, cols: maps.map((m) => x.map((d) => (m.has(d) ? m.get(d) : null))) };
}

function derived(file, name) {
  if (name === 'balance') {
    const im = new Map(file.series.imports ?? []);
    return { balance: (file.series.exports ?? []).filter(([d]) => im.has(d)).map(([d, v]) => [d, Number((v - im.get(d)).toPrecision(15))]) };
  }
  throw new Error(`unknown derived series ${name}`);
}

function hbarSpec(topic, chart, file, ds) {
  let rows;
  let date;
  if (chart.divisions) {
    date = lastPoint(file.series.yoy_overall)[0];
    const at = (k) => new Map(file.series[k] ?? []).get(date);
    rows = Object.entries(CPI_DIVISIONS)
      .map(([code, [en, ms]]) => ({ label: en, ms, code, v: at(`yoy_${code}`) }))
      .filter((r) => Number.isFinite(r.v))
      .sort((a, b) => b.v - a.v);
    rows.unshift({ label: 'All items', ms: 'Semua item', code: 'overall', v: at('yoy_overall') });
  } else if (chart.groups) {
    date = lastPoint(file.series[chart.groups[0][0]])[0];
    rows = chart.groups.map(([k, label]) => ({ label, code: k, v: new Map(file.series[k] ?? []).get(date) })).filter((r) => Number.isFinite(r.v));
  } else throw new Error(`${topic.slug}/${chart.id}: hbar needs divisions or groups`);
  const when = periodLabel(date, ds.period, true);
  const spec = {
    type: 'hbar', fmt: chart.fmt, period: ds.period, title: `${chart.title} (${when})`, when,
    x: rows.map((r) => r.label), series: [{ label: chart.title, c: 1, v: rows.map((r) => r.v) }], highlight: chart.divisions ? 0 : undefined,
  };
  const table = {
    head: [chart.divisions ? 'Division' : 'Group', ...(chart.divisions ? ['Bahagian'] : []), `${when} (${FORMATS[chart.fmt].unit})`],
    rows: rows.map((r) => [r.label, ...(chart.divisions ? [r.ms] : []), fmt(chart.fmt, r.v)]),
  };
  const csv = [[chart.divisions ? 'division' : 'group', ...(chart.divisions ? ['label_en', 'label_ms'] : ['label']), 'date', 'value'], ...rows.map((r) => [r.code, r.label, ...(chart.divisions ? [r.ms] : []), date, r.v])];
  return { spec, table, csv };
}

export function chartSpec(topic, chart, file) {
  const ds = datasetById(topic.dataset);
  if (chart.type === 'hbar') return hbarSpec(topic, chart, file, ds);
  const source = chart.derived ? { ...file.series, ...derived(file, chart.derived) } : file.series;
  const keys = chart.series.map((s) => s[0]);
  for (const k of keys) if (!source[k]?.length) throw new Error(`${topic.slug}/${chart.id}: no series ${k}`);
  const { x, cols } = align(source, keys, chart.last ?? 0);
  const series = chart.series.map(([key, label, c, short], i) => ({ key, label, c, short, v: cols[i] }));
  const spec = { type: chart.type, fmt: chart.fmt, period: ds.period, zero: Boolean(chart.zero), title: chart.title, x, series };
  const table = {
    head: [ds.period === 'week' ? 'Week from' : ds.period[0].toUpperCase() + ds.period.slice(1), ...series.map((s) => s.label)],
    rows: [...x.keys()].reverse().map((i) => [periodLabel(x[i], ds.period), ...series.map((s) => fmt(chart.fmt, s.v[i]))]),
  };
  const csv = [['date', ...series.map((s) => s.key)], ...x.map((d, i) => [d, ...series.map((s) => s.v[i])])];
  return { spec, table, csv };
}

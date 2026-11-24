// Small SVG chart engine, shared by the build (Node renders every chart into the HTML, so
// pages work without JavaScript) and the browser (redraws at the real width so text stays
// at its true size, and adds the crosshair and keyboard reading). Pure functions only.
import { FORMATS, periodLabel, parts } from './format.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const r1 = (v) => Math.round(v * 10) / 10;

// Tick values that are round numbers: 1, 2, 2.5 or 5 times a power of ten.
export function niceTicks(min, max, target = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], step: 1, lo: 0, hi: 1 };
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo, i = 0; v <= hi + step / 2 && i < 50; v += step, i++) ticks.push(Number(v.toPrecision(12)));
  return { ticks, step, lo, hi };
}

const DAY = 86_400_000;
const t = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
const textW = (s, px = 7.4) => String(s).length * px;

// Year ticks (or month ticks for spans under two years) that fit the plot width.
export function timeTicks(x0, x1, plotW) {
  const span = (x1 - x0) / DAY;
  const out = [];
  if (span < 730) {
    const fit = [1, 2, 3, 6, 12].find((m) => (span / 30.4 / m) * 64 <= plotW) ?? 12;
    const s = parts(new Date(x0).toISOString());
    let y = s.y;
    let m = s.m;
    if (s.d > 1) m += 1;
    for (let i = 0; i < 40; i++) {
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      const at = Date.UTC(y, m - 1, 1);
      if (at > x1) break;
      if ((m - 1) % fit === 0) out.push({ at, label: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ’${String(y).slice(2)}` });
      m += 1;
    }
    return out;
  }
  const years = span / 365.25;
  const step = [1, 2, 5, 10, 20, 50].find((s) => (years / s) * 46 <= plotW) ?? 50;
  const y0 = new Date(x0).getUTCFullYear();
  for (let y = Math.ceil(y0 / step) * step; Date.UTC(y, 0, 1) <= x1; y += step) {
    if (Date.UTC(y, 0, 1) >= x0) out.push({ at: Date.UTC(y, 0, 1), label: String(y) });
  }
  return out;
}

function extent(series, zero) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) for (const v of s.v) if (Number.isFinite(v)) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (zero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  return [lo, hi];
}

// Geometry shared by drawing and the pointer/keyboard layer.
export function layoutChart(spec, width, height) {
  const f = FORMATS[spec.fmt];
  if (!f) throw new Error(`unknown format ${spec.fmt}`);
  if (spec.type === 'hbar') {
    const rowH = 28;
    const labelW = Math.min(width * 0.5, Math.max(...spec.x.map((l) => textW(l, 7))) + 10);
    const valW = Math.max(...spec.series[0].v.map((v) => textW(f.value(v), 7.4))) + 10;
    const [lo, hi] = extent(spec.series, true);
    const pad = { l: labelW, r: valW, t: 6, b: 6 };
    const h = pad.t + pad.b + rowH * spec.x.length;
    const plotW = Math.max(40, width - pad.l - pad.r);
    const xs = (v) => pad.l + ((v - lo) / (hi - lo || 1)) * plotW;
    return { kind: 'hbar', width, height: h, pad, plotW, rowH, xs, x0: xs(0), lo, hi };
  }
  const [vlo, vhi] = extent(spec.series, spec.zero);
  const target = height < 240 ? 3 : 5;
  const { ticks, step, lo, hi } = niceTicks(vlo, vhi, target);
  const yLabelW = Math.max(...ticks.map((v) => textW(f.axis(v, step)))) + 10;
  const n = spec.x.length;
  const lastVals = spec.series.map((s) => [...s.v].reverse().find(Number.isFinite));
  const direct = spec.type === 'line' && spec.series.length > 1 && spec.series.length <= 4 && width >= 420;
  const endW = direct ? Math.max(...spec.series.map((s) => textW(s.short ?? s.label, 7))) + 14 : 14;
  const pad = { l: yLabelW, r: endW, t: 12, b: 28 };
  const plotW = Math.max(40, width - pad.l - pad.r);
  const plotH = Math.max(40, height - pad.t - pad.b);
  const ys = (v) => pad.t + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  let xs;
  let band = 0;
  if (spec.type === 'bar') {
    band = plotW / n;
    xs = (i) => pad.l + band * (i + 0.5);
  } else {
    const a = t(spec.x[0]);
    const b = t(spec.x[n - 1]);
    xs = (i) => pad.l + (n === 1 ? plotW / 2 : ((t(spec.x[i]) - a) / (b - a || 1)) * plotW);
  }
  const xTicks = timeTicks(t(spec.x[0]), t(spec.x[n - 1]), plotW).map((tk) => {
    let i = spec.x.findIndex((d) => t(d) >= tk.at);
    if (i < 0) i = n - 1;
    const x = spec.type === 'bar' ? xs(i) : pad.l + ((tk.at - t(spec.x[0])) / (t(spec.x[n - 1]) - t(spec.x[0]) || 1)) * plotW;
    return { ...tk, x };
  });
  return { kind: spec.type, width, height, pad, plotW, plotH, ys, xs, band, ticks, step, lo, hi, xTicks, direct, lastVals };
}

function linePath(L, vals) {
  let d = '';
  let pen = false;
  vals.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${r1(L.xs(i))} ${r1(L.ys(v))}`;
    pen = true;
  });
  return d;
}

// A bar with its far end rounded and its base square on the baseline.
export function barPath(x, w, y0, y1, rad = 3) {
  const h = Math.abs(y1 - y0);
  const r = Math.max(0, Math.min(rad, w / 2, h));
  if (h < 0.5) return `M${r1(x)} ${r1(y0)}h${r1(w)}`;
  if (y1 < y0) return `M${r1(x)} ${r1(y0)}V${r1(y1 + r)}Q${r1(x)} ${r1(y1)} ${r1(x + r)} ${r1(y1)}H${r1(x + w - r)}Q${r1(x + w)} ${r1(y1)} ${r1(x + w)} ${r1(y1 + r)}V${r1(y0)}Z`;
  return `M${r1(x)} ${r1(y0)}V${r1(y1 - r)}Q${r1(x)} ${r1(y1)} ${r1(x + r)} ${r1(y1)}H${r1(x + w - r)}Q${r1(x + w)} ${r1(y1)} ${r1(x + w)} ${r1(y1 - r)}V${r1(y0)}Z`;
}

function hbarPath(x0, x1, y, h, rad = 3) {
  const w = Math.abs(x1 - x0);
  const r = Math.max(0, Math.min(rad, h / 2, w));
  if (w < 0.5) return `M${r1(x0)} ${r1(y)}v${r1(h)}`;
  if (x1 > x0) return `M${r1(x0)} ${r1(y)}H${r1(x1 - r)}Q${r1(x1)} ${r1(y)} ${r1(x1)} ${r1(y + r)}V${r1(y + h - r)}Q${r1(x1)} ${r1(y + h)} ${r1(x1 - r)} ${r1(y + h)}H${r1(x0)}Z`;
  return `M${r1(x0)} ${r1(y)}H${r1(x1 + r)}Q${r1(x1)} ${r1(y)} ${r1(x1)} ${r1(y + r)}V${r1(y + h - r)}Q${r1(x1)} ${r1(y + h)} ${r1(x1 + r)} ${r1(y + h)}H${r1(x0)}Z`;
}

// Spread end labels so they never overlap (14 px apart), keeping them inside the plot.
export function spreadLabels(items, top, bottom, gap = 14) {
  const s = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < s.length; i++) if (s[i].y - s[i - 1].y < gap) s[i].y = s[i - 1].y + gap;
  const over = s.length ? s[s.length - 1].y - bottom : 0;
  if (over > 0) for (const it of s) it.y -= over;
  for (let i = 0; i < s.length; i++) if (s[i].y < top) s[i].y = top + i * gap;
  return items;
}

export function describe(spec) {
  const f = FORMATS[spec.fmt];
  if (spec.type === 'hbar') {
    const s = spec.series[0];
    const pairs = spec.x.map((l, i) => `${l} ${f.value(s.v[i])}`);
    return `Bar chart of ${s.label}${spec.when ? `, ${spec.when}` : ''}: ${pairs.join('; ')}.`;
  }
  const kind = spec.type === 'bar' ? 'Bar chart' : 'Line chart';
  const bits = spec.series.map((s) => {
    const i0 = s.v.findIndex(Number.isFinite);
    let i1 = s.v.length - 1;
    while (i1 > 0 && !Number.isFinite(s.v[i1])) i1 -= 1;
    if (i0 < 0) return `${s.label}: no data`;
    let mi = i0;
    let ma = i0;
    s.v.forEach((v, i) => {
      if (Number.isFinite(v) && v < s.v[mi]) mi = i;
      if (Number.isFinite(v) && v > s.v[ma]) ma = i;
    });
    const at = (i) => periodLabel(spec.x[i], spec.period);
    return `${s.label} went from ${f.value(s.v[i0])} in ${at(i0)} to ${f.value(s.v[i1])} in ${at(i1)}; lowest ${f.value(s.v[mi])} (${at(mi)}), highest ${f.value(s.v[ma])} (${at(ma)})`;
  });
  return `${kind}, ${spec.x.length} ${spec.period}s. ${bits.join('. ')}.`;
}

// The whole chart as one SVG string. Colours come from CSS classes (s1..s5), so both
// themes are styled in the stylesheet, not here.
export function renderChart(spec, { width = 720, height = 300, id = 'c' } = {}) {
  const L = layoutChart(spec, width, height);
  const f = FORMATS[spec.fmt];
  const out = [];
  const W = L.width;
  const H = L.height;
  out.push(`<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="${esc(id)}-t ${esc(id)}-d" preserveAspectRatio="xMinYMin meet" focusable="false">`);
  out.push(`<title id="${esc(id)}-t">${esc(spec.title)}</title><desc id="${esc(id)}-d">${esc(spec.desc ?? describe(spec))}</desc>`);
  if (L.kind === 'hbar') {
    const s = spec.series[0];
    const bh = L.rowH - 10;
    out.push('<g class="grid">', `<line x1="${r1(L.x0)}" x2="${r1(L.x0)}" y1="${L.pad.t}" y2="${H - L.pad.b}" class="zero"/>`, '</g>');
    spec.x.forEach((label, i) => {
      const y = L.pad.t + i * L.rowH + 5;
      const v = s.v[i];
      const x1 = L.xs(Number.isFinite(v) ? v : 0);
      const hl = spec.highlight === i ? ' hl' : '';
      out.push(`<g class="row${hl}" data-i="${i}">`);
      out.push(`<text class="cat" x="${r1(L.pad.l - 10)}" y="${r1(y + bh / 2 + 4)}" text-anchor="end">${esc(label)}</text>`);
      out.push(`<path class="bar s${s.c ?? 1}${v < 0 ? ' neg' : ''}" d="${hbarPath(L.x0, x1, y, bh)}"/>`);
      const vx = v < 0 ? Math.min(x1, L.x0) - 6 : Math.max(x1, L.x0) + 6;
      out.push(`<text class="val" x="${r1(v < 0 ? L.x0 + 6 : vx)}" y="${r1(y + bh / 2 + 4)}">${esc(f.value(v))}</text>`);
      out.push('</g>');
    });
    out.push('</svg>');
    return out.join('');
  }
  // Grid and y axis.
  out.push('<g class="grid">');
  for (const v of L.ticks) {
    const y = r1(L.ys(v));
    out.push(`<line x1="${L.pad.l}" x2="${r1(W - L.pad.r)}" y1="${y}" y2="${y}"${v === 0 ? ' class="zero"' : ''}/>`);
  }
  out.push('</g><g class="axis y">');
  for (const v of L.ticks) out.push(`<text x="${L.pad.l - 8}" y="${r1(L.ys(v) + 4)}" text-anchor="end">${esc(f.axis(v, L.step))}</text>`);
  out.push('</g><g class="axis x">');
  for (const tk of L.xTicks) {
    out.push(`<line x1="${r1(tk.x)}" x2="${r1(tk.x)}" y1="${r1(H - L.pad.b)}" y2="${r1(H - L.pad.b + 4)}"/>`);
    out.push(`<text x="${r1(tk.x)}" y="${r1(H - 8)}" text-anchor="middle">${esc(tk.label)}</text>`);
  }
  out.push('</g>');
  if (L.kind === 'bar') {
    const y0 = L.ys(Math.max(L.lo, Math.min(0, L.hi)));
    const w = Math.max(1, L.band - Math.min(2, L.band * 0.25));
    out.push('<g class="bars">');
    for (const s of spec.series) {
      s.v.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        out.push(`<path class="bar s${s.c ?? 1}${v < 0 ? ' neg' : ''}" d="${barPath(L.xs(i) - w / 2, w, y0, L.ys(v), Math.min(3, w / 3))}"/>`);
      });
    }
    out.push('</g>');
  } else {
    out.push('<g class="lines">');
    spec.series.forEach((s) => out.push(`<path class="line s${s.c ?? 1}" d="${linePath(L, s.v)}" pathLength="1"/>`));
    out.push('</g>');
    // End dots, and direct labels for up to four series.
    const ends = spec.series.map((s, k) => {
      let i = s.v.length - 1;
      while (i > 0 && !Number.isFinite(s.v[i])) i -= 1;
      return { k, i, x: L.xs(i), y: L.ys(s.v[i]), y0: L.ys(s.v[i]), label: s.short ?? s.label, c: s.c ?? k + 1 };
    });
    out.push('<g class="ends">');
    for (const e of ends) out.push(`<circle class="end s${e.c}" cx="${r1(e.x)}" cy="${r1(e.y0)}" r="3.5"/>`);
    if (L.direct) {
      spreadLabels(ends, L.pad.t + 4, H - L.pad.b - 2);
      for (const e of ends) out.push(`<text class="direct" x="${r1(e.x + 8)}" y="${r1(e.y + 4)}">${esc(e.label)}</text>`);
    }
    out.push('</g>');
  }
  out.push('<g class="cursor" aria-hidden="true"></g></svg>');
  return out.join('');
}

// Nearest data index to a horizontal position in the plot.
export function nearestIndex(L, n, px) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(L.xs(i) - px);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// A sparkline for the overview cards: decorative (the card states the numbers in words).
export function sparkSvg(values, { width = 160, height = 40, type = 'line', c = 1 } = {}) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return '';
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (type === 'bar') {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const span = hi - lo || 1;
  const pad = 3;
  const y = (x) => pad + (height - 2 * pad) * (1 - (x - lo) / span);
  const out = [`<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false" preserveAspectRatio="none">`];
  if (type === 'bar') {
    const bw = width / values.length;
    const y0 = y(0);
    values.forEach((x, i) => {
      if (!Number.isFinite(x)) return;
      out.push(`<path class="bar s${c}${x < 0 ? ' neg' : ''}" d="${barPath(i * bw + 1, Math.max(1, bw - 2), y0, y(x), 1.5)}"/>`);
    });
  } else {
    const step = (width - 2 * pad) / (values.length - 1);
    let d = '';
    values.forEach((x, i) => {
      if (Number.isFinite(x)) d += `${d ? 'L' : 'M'}${r1(pad + i * step)} ${r1(y(x))}`;
    });
    out.push(`<path class="line s${c}" d="${d}" pathLength="1"/>`);
    const li = values.length - 1;
    out.push(`<circle class="end s${c}" cx="${r1(pad + li * step)}" cy="${r1(y(values[li]))}" r="2.5"/>`);
  }
  out.push('</svg>');
  return out.join('');
}

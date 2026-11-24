// Number and date formatting, shared by the site build (Node) and the page script (browser).
// English (Malaysia) conventions: RM before the amount, comma thousands, "pp" for
// percentage points.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

// The label of the period a data point stands for.
export function periodLabel(iso, period, long = false) {
  const p = parts(iso);
  if (!p) return String(iso);
  const mon = (long ? MONTHS_LONG : MONTHS)[p.m - 1];
  if (period === 'year') return String(p.y);
  if (period === 'quarter') return `Q${Math.floor((p.m - 1) / 3) + 1} ${p.y}`;
  if (period === 'month') return `${mon} ${p.y}`;
  return `${p.d} ${mon} ${p.y}`;
}

export function dayLabel(iso) {
  return periodLabel(iso, 'day', false);
}

function group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fixed(v, dp) {
  if (!Number.isFinite(v)) return '–';
  const neg = v < 0;
  const s = Math.abs(v).toFixed(dp);
  const [i, f] = s.split('.');
  const out = f ? `${group(i)}.${f}` : group(i);
  return neg && Number(s) !== 0 ? `−${out}` : out;
}

const signed = (v, dp) => {
  const r = Number(v.toFixed(dp));
  return r > 0 ? `+${fixed(r, dp)}` : r === 0 ? fixed(0, dp) : fixed(r, dp);
};

// Decimal places a tick step needs, so 2.5 is never shown as 3.
export function stepDp(step) {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(Number(step.toPrecision(6)));
  if (s.includes('e-')) {
    const [m, e] = s.split('e-');
    return (m.split('.')[1]?.length ?? 0) + Number(e);
  }
  return s.includes('.') ? s.split('.')[1].length : 0;
}

// value: full label; axis: tick label; unit: words for screen readers and tables.
export const FORMATS = {
  rm2: { value: (v) => `RM${fixed(v, 2)}`, axis: (v) => `RM${fixed(v, 2)}`, unit: 'ringgit per litre' },
  pct1: { value: (v) => `${fixed(v, 1)}%`, axis: (v, step) => `${fixed(v, stepDp(step))}%`, unit: 'per cent' },
  rate4: { value: (v) => fixed(v, 4), axis: (v, step) => fixed(v, Math.max(2, stepDp(step))), unit: 'ringgit per unit of currency' },
  rmbn: { value: (v) => `RM${fixed(v / 1e9, 1)} bn`, axis: (v, step) => `RM${fixed(v / 1e9, stepDp(step / 1e9))}bn`, unit: 'billion ringgit' },
  rmbn_m: { value: (v) => `RM${fixed(v / 1e3, 1)} bn`, axis: (v, step) => `RM${fixed(v / 1e3, stepDp(step / 1e3))}bn`, unit: 'billion ringgit at constant 2015 prices' },
  gwh: { value: (v) => `${fixed(v, 0)} GWh`, axis: (v, step) => fixed(v, stepDp(step)), unit: 'gigawatt-hours' },
  people_k: {
    value: (v) => (Math.abs(v) >= 1000 ? `${fixed(v / 1000, 2)} million` : `${fixed(v, 1)} thousand`),
    axis: (v, step) => (step >= 1000 || Math.abs(v) >= 1000 ? `${fixed(v / 1000, stepDp(step / 1000))}m` : `${fixed(v, stepDp(step))}k`),
    unit: 'people',
  },
};

export function fmt(kind, v) {
  const f = FORMATS[kind];
  if (!f) throw new Error(`unknown format ${kind}`);
  return Number.isFinite(v) ? f.value(v) : '–';
}

// A change between two values, in the way that suits the measure.
export function change(mode, cur, prev) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  const diff = cur - prev;
  if (mode === 'pp') return { diff, text: `${signed(diff, 1)} pp`, dir: Math.sign(Number(diff.toFixed(1))) };
  if (mode === 'sen') {
    const sen = Math.round(diff * 100);
    return { diff, text: `${sen > 0 ? '+' : sen < 0 ? '−' : ''}${Math.abs(sen)} sen`, dir: Math.sign(sen) };
  }
  if (mode === 'pct') {
    if (prev === 0) return null;
    const p = (diff / Math.abs(prev)) * 100;
    return { diff, pct: p, text: `${signed(p, 1)}%`, dir: Math.sign(Number(p.toFixed(1))) };
  }
  throw new Error(`unknown change mode ${mode}`);
}

// The API's data_as_of comes as "2026-10", "2026-Q3", "2026" or "2026-11-19 00:01".
export function asOfLabel(s) {
  const v = String(s ?? '');
  let m = /^(\d{4})-Q([1-4])$/.exec(v);
  if (m) return `Q${m[2]} ${m[1]}`;
  m = /^(\d{4})-(\d{2})$/.exec(v);
  if (m) return periodLabel(`${v}-01`, 'month');
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return periodLabel(v, 'day');
  if (/^\d{4}$/.test(v)) return v;
  return v.slice(0, 20);
}

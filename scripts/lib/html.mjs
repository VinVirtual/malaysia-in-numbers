// HTML building with escaping by default: every value interpolated into `html` is escaped
// unless it is itself the result of `html` (or explicitly `raw`, used only for markup this
// code made, such as chart SVG). (Adapted from physical-ai-radar.)

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029\uFFFE\uFFFF\p{Cf}]/gu;
export const stripControl = (s) => String(s ?? '').replace(CONTROL, '');

class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function esc(v) {
  return stripControl(v).replace(/[&<>"'`]/g, (c) => MAP[c]);
}

export function raw(s) {
  return new Safe(String(s));
}

function part(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(String(v));
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += part(v) + strings[i + 1];
  });
  return new Safe(out);
}

export function isSafeUrl(u) {
  if (typeof u !== 'string' || u.length > 2000) return false;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' && !p.username && !p.password;
  } catch {
    return false;
  }
}

// Link inside the site: "../" prefixes (or one leading "/" for the 404 page), then plain
// path characters.
export function localHref(path) {
  const s = String(path);
  const rest = s.startsWith('/') && !s.startsWith('//') ? s.slice(1) : s.replace(/^(\.\.\/)+/, '');
  if (!/^[A-Za-z0-9_\-./#]*$/.test(rest) || rest.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(rest)) {
    throw new Error(`unsafe local link: ${s.slice(0, 80)}`);
  }
  return s;
}

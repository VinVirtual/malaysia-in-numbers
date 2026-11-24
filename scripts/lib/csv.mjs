// CSV (RFC 4180) with spreadsheet-formula protection: a text cell that starts with
// = + - @ or a tab/CR is prefixed with an apostrophe. Numbers are written as numbers.

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v).replace(/\r\n?/g, '\n');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

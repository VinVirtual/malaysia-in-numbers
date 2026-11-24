// Developer tool: turn cached API replies (.cache/api, from a real "mnum fetch") into small
// test fixtures: the meta block plus the rows of each dataset's last 14 dates.
// Usage: node tests/fixtures/make-fixtures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATASETS } from '../../scripts/lib/config.mjs';
import { buildUrl } from '../../scripts/lib/api.mjs';
import { ResponseCache } from '../../scripts/lib/cache.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = new ResponseCache({ dir: path.join(ROOT, '.cache', 'api'), root: ROOT, ttlMs: 365 * 86_400_000 });
for (const ds of DATASETS) {
  const hit = cache.get(buildUrl(ds), 'application/json');
  if (!hit) throw new Error(`${ds.id}: not in the cache; run "mnum fetch" first`);
  const json = JSON.parse(hit.body);
  const dates = [...new Set(json.data.map((r) => r.date))].sort().slice(-14);
  const keep = new Set(dates);
  const data = json.data.filter((r) => keep.has(r.date));
  const out = { meta: json.meta, data };
  fs.writeFileSync(path.join(ROOT, 'tests', 'fixtures', `${ds.id}.json`), `${JSON.stringify(out)}\n`);
  process.stderr.write(`${ds.id}: ${data.length} rows, ${dates[0]} to ${dates.at(-1)}\n`);
}

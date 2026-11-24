#!/usr/bin/env node
// malaysia-in-numbers command line: fetch | site | check | help
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATASET_IDS, DEFAULT_SITE_URL } from './lib/config.mjs';
import { makeHttp, fetchAll } from './lib/fetch.mjs';
import { loadAll, loadReleases } from './lib/store.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `Usage: mnum <command> [options]

  fetch [--offline] [--only id,id] [--no-cache]
        ask api.data.gov.my for every dataset (one request each, 16 s apart),
        write data/series/<id>.json when something changed, log new releases
  site  [--out dir]    build the static site from data/ into dist/ and check it
  check                validate every committed data file and the release log
  help                 this text

Environment: MNUM_SITE_URL sets the absolute site URL used in feeds
(default ${DEFAULT_SITE_URL}).`;

export function parseArgs(argv) {
  const [cmd = 'help', ...rest] = argv;
  const opts = { offline: false, cache: true, only: null, out: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--offline') opts.offline = true;
    else if (a === '--no-cache') opts.cache = false;
    else if (a === '--only') {
      const v = rest[++i] ?? '';
      const ids = v.split(',').filter(Boolean);
      if (!ids.length || ids.some((id) => !DATASET_IDS.includes(id))) throw new Error(`--only takes dataset ids from: ${DATASET_IDS.join(', ')}`);
      opts.only = ids;
    } else if (a === '--out') {
      opts.out = rest[++i];
      if (!opts.out) throw new Error('--out needs a directory');
    } else throw new Error(`unknown option: ${a}`);
  }
  return { cmd, opts };
}

export function siteUrlFromEnv(env = process.env) {
  const u = env.MNUM_SITE_URL?.trim();
  return u || DEFAULT_SITE_URL;
}

async function main(argv) {
  const { cmd, opts } = parseArgs(argv);
  const dataDir = path.join(ROOT, 'data');
  const say = (s) => process.stderr.write(`${s}\n`);
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (cmd === 'fetch') {
    const t0 = Date.now();
    const http = makeHttp({ root: ROOT, offline: opts.offline, useCache: opts.cache });
    const { results, budget } = await fetchAll({ root: ROOT, dataDir, http, only: opts.only, log: say });
    const failed = results.filter((r) => !r.ok);
    const changed = results.filter((r) => r.changed).map((r) => r.id);
    say(`${results.length - failed.length}/${results.length} datasets ok, ${changed.length} changed; ${budget.requests} requests, ${(budget.bytes / 1024).toFixed(0)} KB, ${budget.cacheHits} from cache, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length ? 'true' : 'false'}\nfailed=${failed.map((r) => r.id).join(',')}\n`);
    for (const f of failed) if (process.env.GITHUB_ACTIONS) process.stdout.write(`::warning title=Dataset failed::${f.id}: ${f.error.replace(/[\r\n]+/g, ' ').slice(0, 300)}\n`);
    return failed.length === results.length ? 1 : 0;
  }
  if (cmd === 'check') {
    const all = loadAll(dataDir);
    const missing = DATASET_IDS.filter((id) => !all[id]);
    const releases = loadReleases(dataDir);
    say(`${Object.keys(all).length} dataset files valid${missing.length ? `; missing: ${missing.join(', ')}` : ''}; ${releases.length} release log entries`);
    return missing.length ? 1 : 0;
  }
  if (cmd === 'site') {
    const { buildSite } = await import('./lib/site.mjs');
    const out = opts.out ? path.resolve(opts.out) : path.join(ROOT, 'dist');
    const r = buildSite({ root: ROOT, dataDir, assetsDir: path.join(ROOT, 'assets'), outDir: out, siteUrl: siteUrlFromEnv(), now: new Date() });
    say(`site: ${r.pages} pages, ${r.csv} CSV files, ${(r.bytes / 1024).toFixed(0)} KB in ${path.relative(ROOT, out) || out}`);
    return 0;
  }
  throw new Error(`unknown command: ${cmd} (try "mnum help")`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`mnum: ${err.message}\n`);
      process.exit(2);
    },
  );
}

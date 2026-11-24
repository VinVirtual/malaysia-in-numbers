// The GitHub workflows: pinned actions, least privilege, a deploy that skips cleanly without
// the Cloudflare token, and a schedule that keeps the private repo inside the free minutes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { SCHEDULE } from '../scripts/lib/render/pages.mjs';

const read = (n) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', n), 'utf8');
// Comments are dropped so the checks read only what GitHub runs.
const code = (s) => s.replace(/^\s*#.*$/gm, '').replace(/ #.*$/gm, '');
const daily = code(read('daily.yml'));
const tests = code(read('test.yml'));

test('every action is pinned by a full commit SHA', () => {
  for (const wf of [daily, tests]) {
    for (const m of wf.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, m[1]);
  }
});

test('rights are empty at the top and granted per job; only commit can write', () => {
  assert.match(daily, /^permissions: \{\}$/m);
  const writes = [...daily.matchAll(/contents: write/g)].length;
  assert.equal(writes, 1);
  assert.match(daily, /commit:[\s\S]*?contents: write/);
  assert.match(tests, /^permissions:\n {2}contents: read$/m);
});

test('the fetch job holds no write rights and no stored credentials', () => {
  const fetchJob = daily.split(/\n {2}commit:/)[0];
  assert.match(fetchJob, /persist-credentials: false/);
  assert.doesNotMatch(fetchJob, /secrets\./);
  assert.doesNotMatch(fetchJob, /contents: write/);
});

test('deploy skips with a warning when a Cloudflare secret is missing', () => {
  assert.match(daily, /HAS_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN != '' \}\}/);
  assert.match(daily, /::warning title=Cloudflare deploy skipped::/);
  assert.match(daily, /if: steps\.cf\.outputs\.ready == 'true'\n\s+uses: cloudflare\/wrangler-action@/);
  assert.match(daily, /--project-name=\$\{\{ env\.PAGES_PROJECT \}\}/);
  assert.match(daily, /PAGES_PROJECT: malaysia-in-numbers/);
});

test('commit runs only when something changed; deploy after every good fetch; both on main only', () => {
  assert.match(daily, /commit:\n\s+needs: fetch\n\s+if: needs\.fetch\.outputs\.changed == 'true' && github\.ref == 'refs\/heads\/main'/);
  assert.match(daily, /github\.ref == 'refs\/heads\/main' &&\n\s+\(\(needs\.fetch\.result == 'success' && needs\.commit\.result != 'failure'\) \|\| github\.event\.inputs\.deploy_only == 'true'\)/);
});

test('a partial failure turns the run red after the rest has finished', () => {
  assert.match(daily, /failed: \$\{\{ steps\.fetch\.outputs\.failed \}\}/);
  assert.match(daily, /alert:\n\s+needs: \[fetch, deploy\]\n\s+if: always\(\) && needs\.fetch\.outputs\.failed != ''/);
  assert.match(daily, /FAILED: \$\{\{ needs\.fetch\.outputs\.failed \}\}[\s\S]*exit 1/);
});

test('the release log may only grow', () => {
  assert.match(daily, /cmp -s - data\/releases\.jsonl/);
});

test('the commit job copies only dataset files and the release log, and validates before and after rebase', () => {
  assert.match(daily, /\^\[a-z0-9_\]\+\\\.json\$/);
  assert.match(daily, /git add data\/series data\/releases\.jsonl/);
  assert.equal([...daily.matchAll(/node scripts\/mnum\.mjs check/g)].length >= 3, true);
  assert.match(daily, /190336345\+VinVirtual@users\.noreply\.github\.com/);
});

test('the schedule in the workflow matches the one the Method page states', () => {
  assert.match(daily, new RegExp(`cron: '${SCHEDULE.cron.replace(/\*/g, '\\*')}'`));
});

test('every job has a timeout, so a stuck run cannot eat the month', () => {
  const jobs = [...daily.split(/^jobs:$/m)[1].matchAll(/^ {2}([a-z]+):$/gm)].length;
  assert.equal(jobs, 4);
  assert.equal([...daily.matchAll(/timeout-minutes: \d+/g)].length, jobs);
  const worst = [...daily.matchAll(/timeout-minutes: (\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  assert.ok(worst * 31 < 2000, `worst case ${worst * 31} minutes a month`);
});

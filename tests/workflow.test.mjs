// The GitHub workflows: pinned actions, least privilege, a Pages deploy that is off in this
// repository (manual only, schedule commented for forks) and a schedule a fork can afford.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { SCHEDULE } from '../scripts/lib/render/pages.mjs';

const read = (n) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', n), 'utf8');
// Comments are dropped so the checks read only what GitHub runs.
const code = (s) => s.replace(/^\s*#.*$/gm, '').replace(/ #.*$/gm, '');
const raw = read('deploy-pages.yml');
const daily = code(raw);
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

test('the Pages workflow is off in this repository: manual only, schedule commented for forks', () => {
  assert.match(daily, /^ {2}workflow_dispatch:$/m);
  assert.doesNotMatch(daily, /schedule:/, 'the schedule must stay commented out here');
  assert.match(raw, /^ {2}# schedule:\n {2}# {3}- cron: /m);
  assert.doesNotMatch(raw, /cloudflare|wrangler|CLOUDFLARE_/i);
});

test('only the deploy job can publish to Pages', () => {
  const deployJob = daily.split(/\n {2}deploy:/)[1].split(/\n {2}alert:/)[0];
  assert.match(deployJob, /pages: write/);
  assert.match(deployJob, /id-token: write/);
  assert.match(deployJob, /actions\/deploy-pages@/);
  assert.equal([...daily.matchAll(/pages: write|id-token: write/g)].length, 2);
});

test('commit runs only when something changed; deploy after every good fetch; both on the default branch only', () => {
  assert.match(daily, /commit:\n\s+needs: fetch\n\s+if: needs\.fetch\.outputs\.changed == 'true' && github\.ref_name == github\.event\.repository\.default_branch/);
  assert.match(daily, /github\.ref_name == github\.event\.repository\.default_branch &&\n\s+\(\(needs\.fetch\.result == 'success' && needs\.commit\.result != 'failure'\) \|\| github\.event\.inputs\.deploy_only == 'true'\)/);
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
  assert.match(daily, /41898282\+github-actions\[bot\]@users\.noreply\.github\.com/);
  assert.doesNotMatch(raw, /VinVirtual/);
});

test('the schedule in the workflow matches the one the Method page states', () => {
  assert.match(raw, new RegExp(`cron: '${SCHEDULE.cron.replace(/\*/g, '\\*')}'`));
});

test('every job has a timeout, so a stuck run cannot eat the month', () => {
  const jobs = [...daily.split(/^jobs:$/m)[1].matchAll(/^ {2}([a-z]+):$/gm)].length;
  assert.equal(jobs, 4);
  assert.equal([...daily.matchAll(/timeout-minutes: \d+/g)].length, jobs);
  const worst = [...daily.matchAll(/timeout-minutes: (\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  assert.ok(worst * 31 < 2000, `worst case ${worst * 31} minutes a month`);
});

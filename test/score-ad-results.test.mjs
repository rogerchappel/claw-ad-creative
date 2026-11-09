import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const creative = (hook, layout, cta) => ({ id: `r1-${hook}-${layout}-${cta}`, test: { round: 'r1', hook, layout, cta } });
const manifest = { creatives: [{ id: 'car-h1-card1', carousel: { id: 'car-h1', position: 1 }, test: { round: 'r1', hook: 'h1', layout: 'carousel', cta: null } }, { id: 'car-h1-card2', carousel: { id: 'car-h1', position: 2 }, test: { round: 'r1', hook: 'h1', layout: 'carousel', cta: null } }, creative('h1', 'a', 'c1'), creative('h1', 'b', 'c2'), creative('h2', 'a', 'c2'), creative('h2', 'b', 'c1'), creative('h3', 'a', 'c1'), creative('h3', 'b', 'c2')] };

async function score(csv, extra = []) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-score-test-'));
  temporaryDirectories.push(root);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'export.csv'), csv);
  const result = spawnSync(process.execPath, ['scripts/score-ad-results.mjs', '--manifest', path.join(root, 'manifest.json'), '--results', path.join(root, 'export.csv'), ...extra], { encoding: 'utf8' });
  return { result, root };
}

const header = 'Ad name,Amount spent (AUD),Impressions,Link clicks,App installs\n';

test('ranks pooled variants and carries the winner forward', async () => {
  const csv = `${header}"r1-h1__r1-h1-a-c1__4x5","1,000.50",10000,300,60
r1-h1-b-c2,1000,10000,300,60
r1-h2-a-c2,1000,10000,100,10
r1-h2-b-c1,1000,10000,100,10
r1-h3-a-c1,1000,10000,100,10
r1-h3-b-c2,1000,10000,100,10
Some other ad,50,500,5,0
`;
  const { result, root } = await score(csv);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(path.join(root, 'test-report.json'), 'utf8'));
  assert.equal(report.metric, 'installs');
  assert.equal(report.factors.hook[0].level, 'h1');
  assert.equal(report.factors.hook[0].verdict, 'winner');
  assert.equal(report.factors.hook[0].ads, 2);
  assert.equal(report.factors.hook[0].spend, 2000.5);
  assert.equal(report.factors.hook[1].verdict, 'loser');
  assert.deepEqual(report.next.hook, ['h1']);
  assert.deepEqual(report.unmatched, ['Some other ad']);
  assert.match(await readFile(path.join(root, 'test-report.md'), 'utf8'), /## By hook/);
});

test('falls back to clicks when installs are too few and flags thin data', async () => {
  const csv = `${header}r1-h1-a-c1,10,5000,100,1
r1-h2-a-c2,10,5000,100,1
r1-h3-a-c1,10,200,4,0
`;
  const { result, root } = await score(csv);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(path.join(root, 'test-report.json'), 'utf8'));
  assert.equal(report.metric, 'clicks');
  assert.equal(report.factors.hook.find((level) => level.level === 'h3').verdict, 'not enough data');
  assert.equal(report.factors.hook.find((level) => level.level === 'h1').verdict, 'no clear difference');
});

test('scores a carousel as one ad', async () => {
  const { result, root } = await score(`${header}car-h1,10,5000,100,40\nr1-h2-a-c2,10,5000,100,1\n`);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(path.join(root, 'test-report.json'), 'utf8'));
  assert.deepEqual(report.unmatched, []);
  assert.equal(report.factors.layout.find((level) => level.level === 'carousel').ads, 1);
});

test('rejects bad input', async () => {
  const missing = await score('Ad name,Clicks\nx,1\n');
  assert.equal(missing.result.status, 1);
  assert.match(missing.result.stderr, /missing a column for spend/);
  const none = await score(`${header}other,1,1,1,1\n`);
  assert.equal(none.result.status, 1);
  assert.match(none.result.stderr, /no rows/);
  const metric = await score(`${header}r1-h1-a-c1,1,1,1,1\n`, ['--metric', 'nope']);
  assert.equal(metric.result.status, 1);
  assert.match(metric.result.stderr, /--metric must be/);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const creative = (id, adSet, format) => ({ id, adSet, format, primaryText: `Copy for ${id}`, primaryTextLong: 'Long copy.', headline: "It's a headline", description: 'Free' });
const manifest = {
  creatives: [
    creative('h1-status', 'r1-h1', '4:5'),
    creative('h1-status', 'r1-h1', '1:1'),
    creative('h1-card', 'r1-h1', '4:5'),
    creative('h2-status', 'r1-h2', '4:5'),
    { ...creative('car-card1', 'r1-h2', '1:1'), carousel: { id: 'car', position: 1 } }
  ]
};

async function setup(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-upload-test-'));
  temporaryDirectories.push(root);
  for (const [adSet, id] of [['r1-h1', 'h1-status'], ['r1-h1', 'h1-card'], ['r1-h2', 'h2-status']]) {
    const folder = path.join(root, 'dist', '01 Test', adSet, id);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, `${id}_4x5_1080x1350.jpg`), 'JPG');
  }
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'upload.json'), JSON.stringify({
    campaignFolder: '01 Test',
    manifest: 'manifest.json',
    distDir: 'dist',
    pageId: '111',
    appId: '222',
    appStoreUrl: 'https://apps.apple.com/app/id123',
    dailyBudgetCents: 3000,
    startTime: '2030-01-07T00:00:00+00:00',
    countries: ['US'],
    ...overrides
  }));
  // A stand-in for the Meta CLI: logs its arguments and prints a new ID.
  const cli = path.join(root, 'fake-meta');
  await writeFile(cli, `#!/bin/sh\necho "$@" >> "${path.join(root, 'calls.log')}"\ncount=$(wc -l < "${path.join(root, 'calls.log')}")\necho "{\\"id\\": \\"9000000000$count\\"}"\n`);
  await chmod(cli, 0o755);
  return root;
}

const upload = (root, extra = []) => spawnSync(process.execPath, ['scripts/upload-to-meta.mjs', '--config', path.join(root, 'upload.json'), ...extra], { encoding: 'utf8', env: { ...process.env, META_ADS_CLI: path.join(root, 'fake-meta') } });

test('dry run prints paused commands and calls nothing', async () => {
  const root = await setup();
  const result = upload(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 ad sets, 3 ads, all PAUSED/);
  assert.match(result.stdout, /--objective OUTCOME_APP_PROMOTION --status PAUSED/);
  assert.match(result.stdout, /--optimization-goal APP_INSTALLS/);
  assert.match(result.stdout, /"user_os":\["iOS"\]/);
  assert.match(result.stdout, /Skipped 1 carousel/);
  await assert.rejects(readFile(path.join(root, 'calls.log')));
});

test('--run creates each object once and resumes from saved state', async () => {
  const root = await setup();
  const first = upload(root, ['--run']);
  assert.equal(first.status, 0, first.stderr);
  const calls = (await readFile(path.join(root, 'calls.log'), 'utf8')).trim().split('\n');
  assert.equal(calls.length, 9); // 1 campaign, 2 ad sets, 3 creatives, 3 ads
  assert.ok(calls.every((line) => !/create/.test(line) || /ads creative create|--status PAUSED/.test(line)));
  const state = JSON.parse(await readFile(path.join(root, 'upload.state.json'), 'utf8'));
  assert.equal(Object.keys(state).length, 9);

  const second = upload(root, ['--run']);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already made: campaign/);
  assert.equal((await readFile(path.join(root, 'calls.log'), 'utf8')).trim().split('\n').length, 9);
});

test('--run refuses placeholders and missing images', async () => {
  const root = await setup({ pageId: 'REPLACE_WITH_FACEBOOK_PAGE_ID', imageSize: '9x16_1080x1920' });
  const result = upload(root, ['--run']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /set "pageId"/);
  assert.match(result.stderr, /missing image/);
  await assert.rejects(readFile(path.join(root, 'calls.log')));
});

test('app event optimisation needs an event type', async () => {
  const root = await setup({ optimizationGoal: 'OFFSITE_CONVERSIONS' });
  assert.match(upload(root, ['--run']).stderr, /customEventType/);
  const withEvent = await setup({ optimizationGoal: 'OFFSITE_CONVERSIONS', customEventType: 'PURCHASE' });
  assert.match(upload(withEvent).stdout, /"custom_event_type":"PURCHASE"/);
});

test('rejects unknown options', () => {
  const result = spawnSync(process.execPath, ['scripts/upload-to-meta.mjs', '--publish'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown option --publish/);
});

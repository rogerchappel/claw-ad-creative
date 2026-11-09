import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const single = (format) => ({ id: 'ad-one', adSet: 'set-a', format, image: `${format.replace(':', 'x')}/ad-one.png`, primaryText: 'Short "copy".', primaryTextLong: 'Long copy.', headline: 'Headline', description: 'Free', cta: 'DOWNLOAD', url: 'https://example.com', test: { hook: 'h1', layout: 'status', cta: 'c1' } });
const card = (position) => ({ id: `car-card${position}`, adSet: 'set-b', format: '1:1', image: `1x1/car-card${position}.png`, primaryText: 'Carousel copy.', headline: `Image ${position}`, carousel: { id: 'car', position, headline: `Card ${position}`, description: '' } });

async function setup(config) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-package-test-'));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'ads', '4x5'), { recursive: true });
  await mkdir(path.join(root, 'ads', '1x1'), { recursive: true });
  await writeFile(path.join(root, 'ads', '4x5', 'ad-one.png'), 'PNG');
  await writeFile(path.join(root, 'ads', '1x1', 'ad-one.png'), 'PNG');
  await writeFile(path.join(root, 'ads', '1x1', 'car-card1.png'), 'PNG');
  await writeFile(path.join(root, 'ads', '1x1', 'car-card2.png'), 'PNG');
  await writeFile(path.join(root, 'ads', 'manifest.json'), JSON.stringify({ creatives: [single('4:5'), single('1:1'), card(1), card(2)] }));
  await writeFile(path.join(root, 'PLAN.md'), 'plan');
  await writeFile(path.join(root, 'campaigns.json'), JSON.stringify(config));
  return root;
}

const packageWith = (root, extra, env = {}) => spawnSync(process.execPath, ['scripts/package-campaigns.mjs', '--config', path.join(root, 'campaigns.json'), ...extra], { encoding: 'utf8', env: { ...process.env, ...env } });
const run = (root, extra = []) => packageWith(root, ['--image-format', 'png', ...extra]);

test('packages ads into campaign, ad set and ad folders and zips them', async () => {
  const root = await setup({
    name: 'export',
    include: ['PLAN.md'],
    campaigns: [{ folder: '01 Test', budget: '$10/day', copyNote: 'Use the short text.', manifest: 'ads/manifest.json', adSets: { 'set-a': { budget: '$20/day' }, 'set-video': { note: 'Add video later.' } } }]
  });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 campaign\(s\), 3 ad set\(s\), 2 ad\(s\), 4 image\(s\)/);

  const campaign = path.join(root, 'export', '01 Test');
  assert.deepEqual((await readdir(path.join(campaign, 'set-a', 'ad-one'))).sort(), ['ad-one_1x1_1080x1080.png', 'ad-one_4x5_1080x1350.png', 'copy.txt']);
  assert.deepEqual((await readdir(path.join(campaign, 'set-b', 'car'))).sort(), ['car_card1_1x1_1080x1080.png', 'car_card2_1x1_1080x1080.png', 'copy.txt']);

  const copy = await readFile(path.join(campaign, 'set-a', 'ad-one', 'copy.txt'), 'utf8');
  assert.match(copy, /PRIMARY TEXT \(SHORT\)\nShort "copy"\./);
  assert.match(copy, /PRIMARY TEXT \(LONG\)\nLong copy\./);
  assert.match(copy, /NOTE: Use the short text\./);
  assert.match(await readFile(path.join(campaign, 'set-b', 'car', 'copy.txt'), 'utf8'), /1\. Card 1\n2\. Card 2/);
  assert.match(await readFile(path.join(campaign, 'set-a', 'AD-SET.md'), 'utf8'), /\$20\/day/);
  assert.match(await readFile(path.join(campaign, 'set-b', 'AD-SET.md'), 'utf8'), /\$10\/day/);
  assert.match(await readFile(path.join(campaign, 'set-video', 'AD-SET.md'), 'utf8'), /Add video later\.[\s\S]*none yet/);
  assert.match(await readFile(path.join(campaign, 'CAMPAIGN.md'), 'utf8'), /\| set-a \| 1 \| \$20\/day/);
  assert.match(await readFile(path.join(root, 'export', 'all-ads.csv'), 'utf8'), /"Short ""copy""\."/);
  assert.equal(await readFile(path.join(root, 'export', 'PLAN.md'), 'utf8'), 'plan');
  assert.ok((await readFile(path.join(root, 'export.zip'))).length > 0);
});

test('--no-zip skips the archive', async () => {
  const root = await setup({ name: 'export', campaigns: [{ folder: 'One', manifest: 'ads/manifest.json' }] });
  assert.equal(run(root, ['--no-zip']).status, 0);
  await assert.rejects(readFile(path.join(root, 'export.zip')), { code: 'ENOENT' });
});

test('exports PNGs as JPEGs by default, including top-level images', async () => {
  const root = await setup({ name: 'export', include: ['grid.png', 'PLAN.md'], campaigns: [{ folder: 'One', manifest: 'ads/manifest.json' }] });
  await writeFile(path.join(root, 'grid.png'), 'PNG');
  const tools = path.join(root, 'tools');
  await mkdir(tools);
  await writeFile(path.join(tools, 'sips'), `#!/bin/sh\necho "$6" >> "${root}/quality"\ncp "$7" "$9"\n`);
  await chmod(path.join(tools, 'sips'), 0o755);

  const result = packageWith(root, ['--no-zip', '--jpeg-quality', '70'], { PATH: `${tools}${path.delimiter}${process.env.PATH}` });
  assert.equal(result.status, 0, result.stderr);
  const top = await readdir(path.join(root, 'export'));
  assert.ok(top.includes('grid.jpg') && top.includes('PLAN.md') && !top.includes('grid.png'));
  assert.deepEqual((await readdir(path.join(root, 'export', 'One', 'set-b', 'car'))).sort(), ['car_card1_1x1_1080x1080.jpg', 'car_card2_1x1_1080x1080.jpg', 'copy.txt']);
  assert.match(await readFile(path.join(root, 'quality'), 'utf8'), /^70$/m);
});

test('explains what to do when JPEG export has no converter, and rejects bad options', async () => {
  const root = await setup({ name: 'export', campaigns: [{ folder: 'One', manifest: 'ads/manifest.json' }] });
  const none = packageWith(root, ['--no-zip'], { PATH: path.join(root, 'ads') });
  assert.equal(none.status, 1);
  assert.match(none.stderr, /JPEG export needs sips.*--image-format png/);
  for (const [extra, pattern] of [[['--image-format', 'gif'], /jpeg or png/], [['--jpeg-quality', '0'], /1 to 100/]]) {
    const failed = packageWith(root, extra);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, pattern);
  }
});

test('rejects unsafe names, missing files and bad config', async () => {
  for (const [config, pattern] of [
    [{ campaigns: [] }, /non-empty array/],
    [{ name: '../escape', campaigns: [{ folder: 'One' }] }, /without slashes/],
    [{ campaigns: [{ folder: '../../escape' }] }, /without slashes/],
    [{ campaigns: [{ folder: 'One', manifest: 'missing.json' }] }, /must be a readable file/]
  ]) {
    const result = run(await setup(config));
    assert.equal(result.status, 1);
    assert.match(result.stderr, pattern);
  }
});

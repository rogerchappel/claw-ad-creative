import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function build(items, extra = []) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-board-test-'));
  roots.push(root);
  await writeFile(path.join(root, 'items.json'), JSON.stringify(items));
  const out = path.join(root, 'board');
  const result = spawnSync(process.execPath, ['scripts/build-ad-board.mjs', '--items', path.join(root, 'items.json'), '--out', out, '--today', '2026-11-19', ...extra], { encoding: 'utf8' });
  return { result, root, out };
}

const apify = (id, start, extra = {}) => ({
  adArchiveID: id,
  pageName: 'Brand A',
  isActive: true,
  startDate: Date.UTC(2026, 10, 19 - start) / 1000,
  snapshot: { body: { text: `copy ${id}` }, title: `Headline ${id}`, ctaText: 'Learn more', displayFormat: 'VIDEO', linkUrl: 'https://brand.example', images: [{ resizedImageUrl: 'https://img.example/a.jpg' }] },
  ...extra
});

test('ranks live ads by days running, merges copies and drops ended ones', async () => {
  const items = [
    apify('1', 10),
    apify('2', 120, { collationId: 'g1', collationCount: 4 }),
    apify('3', 40, { collationId: 'g1' }),
    apify('4', 3),
    apify('5', 200, { isActive: false }),
    { adArchiveID: '6', pageName: 'Brand A', isActive: true, snapshot: {} },
    { advertiser: 'Brand B', started: 'Oct 21, 2026', copy: '=HYPERLINK("x")', headline: 'Hand ad', format: 'Image' }
  ];
  const { result, out } = await build(items);
  assert.equal(result.status, 0, result.stderr);
  const board = JSON.parse(await readFile(path.join(out, 'board.json'), 'utf8'));
  assert.deepEqual(board.ads.map((ad) => ad.id).slice(0, 2), ['2', 'hand-' + board.ads[1].id.slice(5)]);
  assert.equal(board.ads[0].signal, 'long-running');
  assert.equal(board.ads[0].variations, 4);
  assert.equal(board.ads[1].days_running, 29);
  assert.equal(board.ads.find((ad) => ad.id === '4').signal, 'new-this-week');
  assert.equal(board.summary.ended, 1);
  assert.equal(board.summary.undated, 1);
  assert.equal(board.summary.mergedCopies, 1);
  assert.equal(board.ads.length, 4);
  const csv = await readFile(path.join(out, 'ads.csv'), 'utf8');
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  const html = await readFile(path.join(out, 'ad-board.html'), 'utf8');
  assert.match(html, /inference, not a result/);
  // Cards use display:flex, which would otherwise override the hidden attribute the filters set.
  assert.match(html, /\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('escapes advertiser text in the HTML board', async () => {
  const { result, out } = await build([{ advertiser: '<script>alert(1)</script>', started: '2026-11-01', copy: 'x' }]);
  assert.equal(result.status, 0, result.stderr);
  const html = await readFile(path.join(out, 'ad-board.html'), 'utf8');
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
});

test('marks long runners from the previous board that have stopped', async () => {
  const first = await build([apify('1', 100), apify('2', 50)]);
  assert.equal(first.result.status, 0, first.result.stderr);
  const second = await build([apify('1', 101)], ['--previous', path.join(first.out, 'board.json')]);
  assert.equal(second.result.status, 0, second.result.stderr);
  const board = JSON.parse(await readFile(path.join(second.out, 'board.json'), 'utf8'));
  assert.deepEqual(board.gone.map((ad) => ad.id), ['2']);
  assert.equal(board.gone[0].signal, 'gone');
});

test('exits non-zero when nothing is live', async () => {
  const { result } = await build([apify('1', 10, { isActive: false })]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /0 live ads/);
});

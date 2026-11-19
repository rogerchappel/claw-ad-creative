import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function check(files, extra = []) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-overlap-test-'));
  roots.push(root);
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(root, name), body);
  const [copy, against] = Object.keys(files);
  return spawnSync(process.execPath, ['scripts/check-copy-overlap.mjs', '--copy', path.join(root, copy), '--against', path.join(root, against), ...extra], { encoding: 'utf8' });
}

const board = JSON.stringify({ ads: [{ advertiser: 'Rival Co', headline: 'Stop guessing', copy: 'I thought face oils were a scam until my skin changed.' }] });

test('flags a copied sentence once, with the advertiser', async () => {
  const result = await check({
    'ours.json': JSON.stringify([{ adName: 'ad-1', primaryText: 'Honestly I thought face oils were a scam until last week.' }, 'Our own words about a calmer morning.']),
    'board.json': board
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /ad-1\n {2}"i thought face oils were a scam until" {2}\(also in: Rival Co\)/);
  assert.match(result.stdout, /1 of 2 ads share wording/);
});

test('passes original copy and reads meta-copy.csv', async () => {
  const result = await check({
    'meta-copy.csv': 'adSet,adName,primaryText,headline\r\nset,ad-1,"Plan the week, then, relax",Calmer mornings\r\n',
    'board.json': board
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No shared phrases of 5\+ words across 1 ads/);
});

test('reads raw Ad Library items and plain text blocks', async () => {
  const items = JSON.stringify([{ pageName: 'Rival Co', snapshot: { body: { text: 'The three step routine that fixed my mornings for good.' } } }]);
  const result = await check({ 'ours.txt': 'First ad here.\n\nThe three step routine that fixed everything.', 'items.json': items });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /block 2/);
});

test('rejects a phrase length under three words', async () => {
  const result = await check({ 'ours.txt': 'x', 'board.json': board }, ['--words', '2']);
  assert.equal(result.status, 1);
});

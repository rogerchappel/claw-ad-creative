import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function runBatch(extraArguments) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-ad-creative-test-'));
  temporaryDirectories.push(root);
  const outDir = path.join(root, 'batch');
  const result = spawnSync(
    process.execPath,
    [
      'scripts/create-ad-batch.mjs',
      '--brand',
      'Test Brand',
      '--brand-url',
      'https://example.com',
      '--audience',
      'test audience',
      '--offer',
      'Test offer',
      '--out-dir',
      outDir,
      ...extraArguments
    ],
    { encoding: 'utf8' }
  );

  return { outDir, result };
}

test('rejects a count with trailing non-numeric characters without writing output', async () => {
  const { outDir, result } = await runBatch(['--count', '2oops']);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'ERROR: --count must be a positive integer\nRun with --help for usage.\n');
  await assert.rejects(readFile(path.join(outDir, 'copy-matrix.csv')), { code: 'ENOENT' });
});

test('rejects an empty formats list without a stack trace or output', async () => {
  const { outDir, result } = await runBatch(['--formats', ',']);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'ERROR: --formats must contain at least one non-empty value\nRun with --help for usage.\n');
  assert.doesNotMatch(result.stderr, /^\s+at |TypeError/m);
  await assert.rejects(readFile(path.join(outDir, 'copy-matrix.csv')), { code: 'ENOENT' });
});

test('generates the requested variants for a documented batch invocation', async () => {
  const { outDir, result } = await runBatch(['--count', '3', '--formats', '9:16,4:5,1:1']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), outDir);
  const rows = (await readFile(path.join(outDir, 'copy-matrix.csv'), 'utf8')).trimEnd().split('\n');
  assert.equal(rows.length, 4, 'CSV should contain one header and three variants');
});

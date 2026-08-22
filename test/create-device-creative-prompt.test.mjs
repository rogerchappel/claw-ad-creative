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

async function runPrompt(extraArguments) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-device-prompt-test-'));
  temporaryDirectories.push(root);
  const out = path.join(root, 'prompt.json');
  const result = spawnSync(process.execPath, [
    'scripts/create-device-creative-prompt.mjs',
    '--brand-name', 'Test Brand', '--screenshot', '/tmp/first.png',
    '--audience', 'test audience', '--offer', 'Test offer', '--cta', 'Try it',
    '--out', out, ...extraArguments
  ], { encoding: 'utf8' });
  return { out, result };
}

test('rejects an unknown long option before writing output', async () => {
  const { out, result } = await runPrompt(['--aspect-rato', '9:16']);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'ERROR: unrecognized option: --aspect-rato\nRun with --help for usage.\n');
  await assert.rejects(readFile(out), { code: 'ENOENT' });
});

test('supports documented options and repeatable screenshots', async () => {
  const { out, result } = await runPrompt([
    '--screenshot', '/tmp/second.png', '--aspect-ratio', '9:16', '--provider', 'fal',
    '--model', 'runtime-selected', '--style', 'editorial', '--device', 'iPhone'
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), out);
  const prompt = JSON.parse(await readFile(out, 'utf8'));
  assert.deepEqual(prompt.product.screenshots, ['/tmp/first.png', '/tmp/second.png']);
  assert.equal(prompt.asset.aspectRatio, '9:16');
  assert.equal(prompt.provider, 'fal');
});

test('rejects duplicate scalar options before writing output', async () => {
  const { out, result } = await runPrompt(['--brand-name', 'Other Brand']);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'ERROR: option may only be specified once: --brand-name\nRun with --help for usage.\n');
  await assert.rejects(readFile(out), { code: 'ENOENT' });
});

test('creates parent directories for nested output paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-device-prompt-nested-test-'));
  temporaryDirectories.push(root);
  const out = path.join(root, 'nested', 'prompt-packs', 'prompt.json');
  const result = spawnSync(process.execPath, [
    'scripts/create-device-creative-prompt.mjs',
    '--brand-name', 'Test Brand', '--screenshot', '/tmp/first.png',
    '--audience', 'test audience', '--offer', 'Test offer', '--cta', 'Try it',
    '--out', out
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), out);
  const prompt = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(prompt.brand.name, 'Test Brand');
});

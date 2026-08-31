import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';

const temporaryDirectories = [];
const script = fileURLToPath(new URL('../scripts/create-device-creative-prompt.mjs', import.meta.url));

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function runPrompt(extraArguments) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-device-prompt-test-'));
  temporaryDirectories.push(root);
  const out = path.join(root, 'prompt.json');
  const screenshot = path.join(root, 'first.png');
  await writeFile(screenshot, 'PNG-SOURCE');
  const result = spawnSync(process.execPath, [
    'scripts/create-device-creative-prompt.mjs',
    '--brand-name', 'Test Brand', '--screenshot', screenshot,
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
  const assets = await mkdtemp(path.join(tmpdir(), 'claw-device-prompt-assets-test-'));
  temporaryDirectories.push(assets);
  const second = path.join(assets, 'second.png');
  await writeFile(second, 'PNG-SOURCE-2');
  const { out, result } = await runPrompt([
    '--screenshot', second, '--aspect-ratio', '9:16', '--provider', 'fal',
    '--model', 'runtime-selected', '--style', 'editorial', '--device', 'iPhone'
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), out);
  const prompt = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(prompt.product.screenshots.length, 2);
  assert.equal(prompt.asset.aspectRatio, '9:16');
  assert.equal(prompt.provider, 'fal');
});

test('rejects missing, unreadable, and non-regular source assets before creating output', async (t) => {
  await t.test('missing screenshot', async () => {
    const { out, result } = await runPrompt(['--screenshot', '/definitely/missing.png']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /source asset does not exist/);
    await assert.rejects(readFile(out), { code: 'ENOENT' });
  });

  await t.test('directory logo', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'claw-device-prompt-directory-test-'));
    temporaryDirectories.push(root);
    const logo = path.join(root, 'logo');
    await mkdir(logo);
    const { out, result } = await runPrompt(['--logo', logo]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /source asset is not a regular file/);
    await assert.rejects(readFile(out), { code: 'ENOENT' });
  });
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

test('rejects a screenshot output alias and preserves the source', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-device-prompt-collision-test-'));
  temporaryDirectories.push(root);
  const screenshot = path.join(root, 'screenshot.png');
  await writeFile(screenshot, 'PNG-SOURCE');

  const result = spawnSync(process.execPath, [
    script,
    '--brand-name', 'Test Brand', '--screenshot', 'screenshot.png',
    '--audience', 'test audience', '--offer', 'Test offer', '--cta', 'Try it',
    '--out', screenshot
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'ERROR: --out must not overwrite a source asset: screenshot.png\nRun with --help for usage.\n');
  assert.equal(await readFile(screenshot, 'utf8'), 'PNG-SOURCE');
});

test('rejects a logo output alias and preserves the source', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-device-prompt-logo-collision-test-'));
  temporaryDirectories.push(root);
  const logo = path.join(root, 'logo.png');
  const outputAlias = path.join(root, 'logo-output.png');
  await writeFile(logo, 'LOGO-SOURCE');
  await link(logo, outputAlias);

  const result = spawnSync(process.execPath, [
    script,
    '--brand-name', 'Test Brand', '--screenshot', 'screenshot.png', '--logo', logo,
    '--audience', 'test audience', '--offer', 'Test offer', '--cta', 'Try it',
    '--out', 'logo-output.png'
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `ERROR: --out must not overwrite a source asset: ${logo}\nRun with --help for usage.\n`);
  assert.equal(await readFile(logo, 'utf8'), 'LOGO-SOURCE');
});

test('writes a distinct nested output when source assets are present', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-device-prompt-distinct-test-'));
  temporaryDirectories.push(root);
  await writeFile(path.join(root, 'screenshot.png'), 'PNG-SOURCE');
  await writeFile(path.join(root, 'logo.png'), 'LOGO-SOURCE');
  const out = path.join(root, 'nested', 'prompt.json');

  const result = spawnSync(process.execPath, [
    script,
    '--brand-name', 'Test Brand', '--screenshot', 'screenshot.png', '--logo', 'logo.png',
    '--audience', 'test audience', '--offer', 'Test offer', '--cta', 'Try it',
    '--out', out
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), out);
  assert.equal(JSON.parse(await readFile(out, 'utf8')).brand.logo, 'logo.png');
});

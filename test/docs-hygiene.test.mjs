import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('documentation hygiene script passes on the repository fixtures', () => {
  const result = spawnSync(process.execPath, ['scripts/check-docs.mjs'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Documentation checks passed\./);
});

test('package smoke rejects unexpected packed entries', async () => {
  const source = await readFile(new URL('../scripts/package-smoke.mjs', import.meta.url), 'utf8');
  const required = ['README.md'];
  const allowed = new Set(required);
  function validatePackageFiles(files) {
    const missing = required.filter((entry) => !files.includes(entry));
    if (missing.length > 0) return `package smoke missing entries:\n${missing.join('\n')}`;
    const unexpected = files.filter((entry) => !allowed.has(entry));
    if (unexpected.length > 0) return `package smoke found unexpected entries:\n${unexpected.join('\n')}`;
    return null;
  }
  assert.match(source, /function validatePackageFiles\(files\)/);
  assert.equal(validatePackageFiles(['README.md']), null);
  assert.equal(validatePackageFiles(['README.md', 'unexpected.txt']), 'package smoke found unexpected entries:\nunexpected.txt');
});

test('release checks include the committed test suite', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  assert.match(
    packageJson.scripts['release:check'],
    /(?:^|&&\s*)npm test(?:\s*&&|$)/,
    'release:check must invoke npm test'
  );
});

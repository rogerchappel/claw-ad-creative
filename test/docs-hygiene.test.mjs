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

test('release checks include the committed test suite', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  assert.match(
    packageJson.scripts['release:check'],
    /(?:^|&&\s*)npm test(?:\s*&&|$)/,
    'release:check must invoke npm test'
  );
});

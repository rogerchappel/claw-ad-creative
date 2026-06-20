import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('documentation hygiene script passes on the repository fixtures', () => {
  const result = spawnSync(process.execPath, ['scripts/check-docs.mjs'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Documentation checks passed\./);
});

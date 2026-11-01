import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

 test('package smoke accepts the repository package contents', () => {
  const result = spawnSync(process.execPath, ['scripts/package-smoke.mjs'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /package smoke passed/);
});

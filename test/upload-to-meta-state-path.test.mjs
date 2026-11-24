import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const script = path.resolve('scripts/upload-to-meta.mjs');

test('preview reports the adjacent state filename for JSON and extensionless configs', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'upload-state-path-'));
  try {
    const manifest = path.join(dir, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ creatives: [{ id: 'sample', primaryText: 'Example' }] }));
    const image = path.join(dir, 'dist', 'campaign', 'default', 'sample', 'sample_4x5_1080x1350.jpg');
    mkdirSync(path.dirname(image), { recursive: true });
    writeFileSync(image, 'fixture');
    const config = { manifest, distDir: 'dist', campaignFolder: 'campaign', campaignName: 'test', startTime: '2026-01-01T00:00:00Z', pageId: '1', appId: '2', appStoreUrl: 'https://example.test', dailyBudgetCents: 100, countries: ['US'] };
    for (const name of ['config.json', 'config']) {
      const file = path.join(dir, name);
      writeFileSync(file, JSON.stringify(config));
      const result = spawnSync(process.execPath, [script, '--config', file], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(`as ${path.join(dir, 'config.state.json')}.`));
      assert.ok(result.stdout.includes('meta ads campaign create'));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['FAL_KEY', 'ADS_LIBRARY_API_KEY', 'META_ACCESS_TOKEN'].includes(key))
);

function runSetup(mode) {
  return spawnSync('bash', ['scripts/install-mcps.sh', mode], {
    cwd: root,
    env: cleanEnv,
    encoding: 'utf8'
  });
}

test('setup check reports required tools and does not require credentials', () => {
  const result = runSetup('check');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok: node found at .+$/m);
  assert.match(result.stdout, /^ok: npm found at .+$/m);
  assert.match(result.stdout, /^ok: npx found at .+$/m);
  assert.match(result.stdout, /^info: FAL_KEY is not present in this shell/m);
});

test('setup print-config emits valid, credential-placeholder-only JSON snippets', () => {
  const result = runSetup('print-config');
  assert.equal(result.status, 0, result.stderr);
  const sections = result.stdout.trim().split('\n\n# CrewCMD skill assignment config\n');
  assert.equal(sections.length, 2);
  assert.ok(sections[0].startsWith('# OpenClaw runtime snippet\n'));
  const runtime = JSON.parse(sections[0].slice('# OpenClaw runtime snippet\n'.length));
  const assignment = JSON.parse(sections[1]);
  assert.equal(runtime.skills.entries['facebook-ad-creative'].enabled, true);
  assert.equal(runtime.mcp.servers.fal.headers.Authorization, 'Bearer ${FAL_KEY}');
  assert.equal(runtime.mcp.servers['facebook-ads-library'].env.ADS_LIBRARY_API_KEY, '${ADS_LIBRARY_API_KEY}');
  assert.equal(runtime.mcp.servers['facebook-ads-library'].disabled, true);
  assert.equal(runtime.mcp.servers['meta-ads'].disabled, true);
  assert.equal(assignment.canPublishAds, false);
  assert.equal(assignment.canChangeBudget, false);
  assert.doesNotMatch(result.stdout, /(?:sk-[A-Za-z0-9]{12,}|Bearer\s+(?!\$\{)[A-Za-z0-9._-]{12,})/);
});

test('setup rejects an unsupported mode with usage and a nonzero exit', () => {
  const result = runSetup('unsupported');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const cleanups = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/research-ads-library.mjs', ...args], {
      env: { PATH: process.env.PATH, ...env }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function fakeApify() {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, url: request.url, auth: request.headers.authorization, body: body ? JSON.parse(body) : null });
    const send = (data) => response.end(JSON.stringify(data));
    if (request.url.startsWith('/v2/acts/')) return send({ data: { id: 'run1', status: 'RUNNING' } });
    if (request.url.startsWith('/v2/actor-runs/run1')) return send({ data: { id: 'run1', status: 'SUCCEEDED', defaultDatasetId: 'ds1', usageTotalUsd: 0.12 } });
    if (request.url.startsWith('/v2/datasets/ds1/items')) return send([{ adArchiveID: '1' }, { adArchiveID: '2' }]);
    if (request.url === '/v2/users/me') return send({ data: { username: 'tester', plan: { id: 'FREE' } } });
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise((resolve) => server.close(resolve)));
  return { requests, base: `http://127.0.0.1:${server.address().port}/v2` };
}

test('previews the estimate without a token or a network call', async () => {
  const result = await run(['--keyword', 'garden tools', '--country', 'AU']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /about \$0\.58/);
  assert.match(result.stdout, /Preview only/);
});

test('asks before pulling more than 100 ads', async () => {
  const result = await run(['--keyword', 'x', '--max-items', '200']);
  assert.equal(result.status, 4);
  assert.match(result.stdout, /--allow-larger/);
});

test('refuses to go past the owner ceiling, whatever the flags say', async () => {
  const result = await run(['--keyword', 'x', '--max-usd', '20', '--confirm', '--out', 'x.json'], { APIFY_TOKEN: 't' });
  assert.equal(result.status, 4);
  assert.match(result.stdout, /over the \$5\.00 ceiling/);
});

test('rejects a page that is not a Facebook link', async () => {
  const result = await run(['--page', 'https://example.com/brand']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--page must be/);
});

test('runs the actor with caps, saves the ads and a receipt', async () => {
  const { requests, base } = await fakeApify();
  const root = await mkdtemp(path.join(tmpdir(), 'claw-research-test-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const out = path.join(root, 'items.json');
  const result = await run(['--keyword', 'garden tools', '--page', 'https://www.facebook.com/brand', '--confirm', '--out', out], { APIFY_TOKEN: 'secret-token', APIFY_BASE_URL: base });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-token/);
  const start = requests[0];
  assert.match(start.url, /maxItems=100/);
  assert.match(start.url, /maxTotalChargeUsd=0\.70/);
  assert.doesNotMatch(start.url, /secret-token/);
  assert.equal(start.auth, 'Bearer secret-token');
  assert.equal(start.body.startUrls.length, 2);
  assert.equal(start.body.resultsLimit, 50);
  assert.equal(JSON.parse(await readFile(out, 'utf8')).length, 2);
  const receipt = JSON.parse(await readFile(path.join(root, 'items.run.json'), 'utf8'));
  assert.equal(receipt.chargedUsd, 0.12);
});

test('check proves the token without starting a run', async () => {
  const { requests, base } = await fakeApify();
  const result = await run(['--check'], { APIFY_TOKEN: 't', APIFY_BASE_URL: base });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Account: tester/);
  assert.deepEqual(requests.map((r) => r.url), ['/v2/users/me']);
});

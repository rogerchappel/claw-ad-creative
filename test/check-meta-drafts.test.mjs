import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const storeUrl = 'https://apps.apple.com/app/id123';
const creative = (id, format = '4:5') => ({ id, format, primaryText: `Copy for ${id}`, headline: `Headline ${id}`, description: 'Free', cta: 'INSTALL_MOBILE_APP' });
const manifest = { creatives: [creative('h1-status'), creative('h1-status', '9:16'), creative('h1-card')] };

const draftAd = (name, linkData, errors = []) => ({
  ad_object_type: 'ad',
  values: { name: { new: name }, creative: { new: { object_story_spec: { link_data: linkData } } } },
  active_errors: errors
});
const fullLink = (id) => ({
  link: storeUrl,
  image_hash: `hash-${id}`,
  message: `Copy for ${id}`,
  name: `Headline ${id}`,
  description: 'Free',
  call_to_action: { type: 'INSTALL_MOBILE_APP', value: { link: storeUrl } }
});

async function run(drafts) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-drafts-test-'));
  temporaryDirectories.push(root);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'drafts.json'), JSON.stringify(drafts));
  return spawnSync(process.execPath, ['scripts/check-meta-drafts.mjs', '--drafts', path.join(root, 'drafts.json'), '--manifest', path.join(root, 'manifest.json'), '--store-url', storeUrl], { encoding: 'utf8' });
}

test('passes complete ads and warns that they have one image', async () => {
  const result = await run([draftAd('h1-status', fullLink('h1-status')), draftAd('h1-card', fullLink('h1-card'))]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS: h1-status/);
  assert.match(result.stdout, /WARN: h1-card: one image only/);
  assert.match(result.stdout, /2 ads checked, 0 failed/);
});

test('fails a dropped headline and description, a Meta error and a missing ad', async () => {
  const { name, description, ...withoutHeadline } = fullLink('h1-status');
  const error = { error_code: 1885183, error_summary: 'Ads creative post was created by an app that is in development mode' };
  const result = await run({ ad_drafts: JSON.stringify([draftAd('h1-status', withoutHeadline, [error]), draftAd('temp-upload', {})]) });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL: h1-status: headline is missing; re-enter "Headline h1-status"/);
  assert.match(result.stdout, /FAIL: h1-status: description is missing/);
  assert.match(result.stdout, /FAIL: h1-status: Meta error #1885183/);
  assert.match(result.stdout, /FAIL: h1-card: no ad with this name/);
  assert.match(result.stdout, /WARN: temp-upload: ad is in the draft but not in the manifest/);
});

test('reads copy and images from an asset feed spec', async () => {
  const feedAd = {
    ad_object_type: 'ad',
    values: { name: { new: 'h1-card' }, creative: { new: { call_to_action_type: 'INSTALL_MOBILE_APP', asset_feed_spec: {
      bodies: [{ text: 'Copy for h1-card' }], titles: [{ text: 'Headline h1-card' }], descriptions: [{ text: 'Free' }],
      images: [{ hash: 'a' }, { hash: 'b' }], link_urls: [{ website_url: storeUrl }]
    } } } }
  };
  const result = await run([draftAd('h1-status', fullLink('h1-status')), feedAd]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /PASS: h1-card/);
  assert.doesNotMatch(result.stdout, /WARN: h1-card/);
});

test('rejects unknown options and unreadable input', () => {
  const unknown = spawnSync(process.execPath, ['scripts/check-meta-drafts.mjs', '--nope', 'x'], { encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unrecognized option/);
  const missing = spawnSync(process.execPath, ['scripts/check-meta-drafts.mjs', '--drafts', 'missing.json', '--manifest', 'missing.json'], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /could not be read as JSON/);
});

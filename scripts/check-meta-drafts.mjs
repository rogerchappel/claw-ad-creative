#!/usr/bin/env node
// Compare the ads staged in a Meta Ads Manager draft with the manifest they
// were built from. Run it after a human has opened and saved each ad in Ads
// Manager, because that save can drop the headline and description.
import { readFileSync } from 'node:fs';

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
for (const required of ['drafts', 'manifest']) {
  if (!options[required]) fail(`missing required --${required} path`);
}
if (options.copy && !['short', 'long'].includes(options.copy)) fail('--copy must be short or long');

const manifest = readJson(options.manifest, '--manifest');
const drafts = readJson(options.drafts, '--drafts');

const expected = new Map();
for (const creative of manifest.creatives ?? []) {
  if (creative.carousel || expected.has(creative.id)) continue;
  expected.set(creative.id, creative);
}
if (expected.size === 0) fail('--manifest has no creatives');

const ads = new Map(draftAds(drafts).map((ad) => [ad.name, ad]));
const results = [];

for (const [id, creative] of expected) {
  const ad = ads.get(id);
  if (!ad) {
    results.push({ id, level: 'FAIL', message: 'no ad with this name in the draft' });
    continue;
  }
  const problems = checkAd(ad, creative);
  if (!problems.some((problem) => problem.level === 'FAIL')) results.push({ id, level: 'PASS', message: 'copy, link, button and errors all match' });
  results.push(...problems.map((problem) => ({ id, ...problem })));
}
for (const name of ads.keys()) {
  if (!expected.has(name)) results.push({ id: name, level: 'WARN', message: 'ad is in the draft but not in the manifest; delete it if it was a throwaway' });
}

for (const adSet of draftAdSets(drafts)) results.push(...checkAdSet(adSet));

for (const { id, level, message } of results) console.log(`${level}: ${id}: ${message}`);
const failures = results.filter((result) => result.level === 'FAIL').length;
const warnings = results.filter((result) => result.level === 'WARN').length;
console.log(`\n${expected.size} ads checked, ${failures} failed, ${warnings} warnings.`);
process.exit(failures > 0 ? 1 : 0);

function checkAd(ad, creative) {
  const problems = [];
  const failIf = (condition, message) => condition && problems.push({ level: 'FAIL', message });
  for (const error of ad.errors) {
    problems.push({ level: 'FAIL', message: `Meta error #${error.error_code ?? '?'}: ${error.error_summary ?? error.error_description ?? 'unknown'}` });
  }
  const text = options.copy === 'long' && creative.primaryTextLong ? creative.primaryTextLong : creative.primaryText;
  const fields = creativeFields(ad.creative);
  failIf(text && !fields.texts.includes(text), describe('primary text', fields.texts, text));
  failIf(creative.headline && !fields.headlines.includes(creative.headline), describe('headline', fields.headlines, creative.headline));
  failIf(creative.description && !fields.descriptions.includes(creative.description), describe('description', fields.descriptions, creative.description));
  failIf(creative.cta && fields.cta !== creative.cta, `button is ${fields.cta ?? 'missing'}, expected ${creative.cta}`);
  failIf(options['store-url'] && fields.link !== options['store-url'], `link is ${fields.link ?? 'missing'}, expected ${options['store-url']}`);
  if (fields.imageCount < 2) problems.push({ level: 'WARN', message: 'one image only; add the 9:16 and 1:1 sizes per placement in Ads Manager' });
  return problems;
}

// Ad set targeting: an iOS campaign not marked iOS 14+ reads back as user_os
// "iOS_ver_2.0_to_14.4" and reaches almost nobody; Advantage+ placements include
// Audience Network unless publisher_platforms says otherwise.
function checkAdSet({ name, targeting }) {
  if (!targeting) return [];
  const problems = [];
  if ((targeting.user_os ?? []).some((os) => /to_14\.4$/.test(os))) {
    problems.push({ id: name, level: 'FAIL', message: 'targets iOS 14.4 and earlier only; rebuild under a campaign marked iOS 14+ (is_skadnetwork_attribution, or campaign_attribution AEM)' });
  }
  const platforms = targeting.publisher_platforms;
  if (!platforms || platforms.includes('audience_network')) {
    problems.push({ id: name, level: 'WARN', message: 'Audience Network is included; set publisher_platforms without it unless the human chose it' });
  }
  return problems;
}

function describe(label, found, wanted) {
  return found.length === 0 ? `${label} is missing; re-enter "${wanted}"` : `${label} is "${found[0]}", expected "${wanted}"`;
}

function creativeFields(creative = {}) {
  const link = creative.object_story_spec?.link_data ?? {};
  const feed = creative.asset_feed_spec ?? {};
  const texts = (list) => (Array.isArray(list) ? list.map((item) => item?.text).filter(Boolean) : []);
  const images = new Set([link.image_hash, ...(feed.images ?? []).map((image) => image?.hash)].filter(Boolean));
  return {
    texts: [link.message, ...texts(feed.bodies)].filter(Boolean),
    headlines: [link.name, ...texts(feed.titles)].filter(Boolean),
    descriptions: [link.description, ...texts(feed.descriptions)].filter(Boolean),
    cta: link.call_to_action?.type ?? creative.call_to_action_type ?? feed.call_to_action_types?.[0],
    link: link.call_to_action?.value?.link ?? link.link ?? feed.link_urls?.[0]?.website_url,
    imageCount: images.size
  };
}

function draftAdSets(input) {
  return draftItems(input)
    .filter((item) => item?.ad_object_type === 'adset')
    .map((item) => ({ name: item.values?.name?.new ?? item.ad_object_id, targeting: item.values?.targeting?.new }));
}

// Accepts the raw ads_get_ad_entities result (ad_drafts may be a JSON string)
// or a plain array of draft objects.
function draftAds(input) {
  return draftItems(input)
    .filter((item) => item?.ad_object_type === 'ad')
    .map((item) => ({
      name: item.values?.name?.new ?? item.ad_object_id,
      creative: item.values?.creative?.new,
      errors: Array.isArray(item.active_errors) ? item.active_errors : []
    }));
}

function draftItems(input) {
  let list = Array.isArray(input) ? input : input?.ad_drafts;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch (error) {
      fail(`--drafts ad_drafts is not valid JSON: ${error.message}`);
    }
  }
  if (!Array.isArray(list)) fail('--drafts must be an ads_get_ad_entities draft result or an array of draft objects');
  return list;
}

function readJson(file, flag) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${flag} could not be read as JSON: ${error.message}`);
  }
}

function parseArgs(argv) {
  const known = new Set(['drafts', 'manifest', 'store-url', 'copy']);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    const name = arg.startsWith('--') ? arg.slice(2) : null;
    if (!name || !known.has(name)) fail(`unrecognized option: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value`);
    parsed[name] = value;
    index += 1;
  }
  return parsed;
}

function fail(message) {
  console.error(`ERROR: ${message}\nRun with --help for usage.`);
  process.exit(1);
}

function printHelp() {
  console.log(`Check staged Meta ads against the manifest they were built from.

Usage:
  node scripts/check-meta-drafts.mjs --drafts drafts.json --manifest manifest.json [options]

  --drafts     Saved result of ads_get_ad_entities with object_state=draft
  --manifest   The manifest.json the ads were built from (ads are matched by name = creative id)
  --store-url  Expected App Store or Play Store link
  --copy       short (default) or long primary text

Fails on a missing ad, a Meta error, or missing or changed primary text,
headline, description, button or link, and on ad sets that only reach iOS 14.4
and earlier. Warns on ads with one image, ads that are not in the manifest and
ad sets that include Audience Network.`);
}

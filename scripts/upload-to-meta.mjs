#!/usr/bin/env node
// Builds one app install campaign in Meta with Meta's Ads CLI (`meta`),
// everything PAUSED. Reads a render manifest and a packaged campaign folder.
//
// The CLI reads ACCESS_TOKEN and AD_ACCOUNT_ID from the environment or from a
// .env file in the folder you run this from. This script never reads the token.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const known = new Set(['--config', '--run', '--validate', '--help', '-h']);
const fail = (message) => {
  console.error(`upload-to-meta: ${message}`);
  process.exit(1);
};

for (let i = 0; i < args.length; i += 1) {
  if (!known.has(args[i])) fail(`unknown option ${args[i]}; run with --help`);
  if (args[i] === '--config') i += 1;
}
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/upload-to-meta.mjs --config <file> [--validate | --run]

Creates one app install campaign with the Meta Ads CLI: a campaign, one ad set
per "adSet" in the manifest and one ad per creative. Everything is PAUSED.

  (no flag)    print the commands and create nothing
  --validate   ask Meta to validate the campaign settings and create nothing
  --run        create the campaign, ad sets, creatives and ads

Config (JSON; paths are relative to the config file):
  manifest          manifest.json written by creative:render
  distDir           folder written by creative:package
  campaignFolder    campaign folder inside distDir
  campaignName      campaign name in Meta (default: campaignFolder)
  pageId            Facebook Page ID the ads run from
  appId             Meta app ID that has the mobile app attached
  appStoreUrl       store URL of the app
  instagramUserId   optional Instagram account ID
  dailyBudgetCents  daily budget per ad set, in the ad account's minor unit
  startTime,endTime ISO 8601 with offset; endTime is optional
  countries         country codes, for example ["US","CA"]
  os                device platform (default "iOS")
  imageSize         file suffix of the image to upload (default "4x5_1080x1350")
  callToAction      button value (default "INSTALL_MOBILE_APP")
  copy              "short" or "long" primary text (default "short")
  optimizationGoal  default "APP_INSTALLS"
  customEventType   app event for OFFSITE_CONVERSIONS, for example "PURCHASE"
  skadnetworkAttribution  true to pass --skadnetwork-attribution

Created IDs are saved beside the config as <name>.state.json, so a run that
stops can be started again without making duplicates. Carousels are skipped.
Set META_ADS_CLI to use a CLI binary other than "meta".`);
  process.exit(0);
}

const configIndex = args.indexOf('--config');
const configArg = configIndex >= 0 ? args[configIndex + 1] : undefined;
if (!configArg) fail('missing required --config path; run with --help');
const RUN = args.includes('--run');
const VALIDATE = args.includes('--validate');
if (RUN && VALIDATE) fail('use --validate or --run, not both');

const readJson = (file, label) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return fail(`${label} could not be read as JSON: ${error.message}`);
  }
};

const configPath = path.resolve(configArg);
const base = path.dirname(configPath);
const cfg = {
  os: 'iOS',
  imageSize: '4x5_1080x1350',
  callToAction: 'INSTALL_MOBILE_APP',
  copy: 'short',
  optimizationGoal: 'APP_INSTALLS',
  ...readJson(configPath, '--config')
};
cfg.campaignName ??= cfg.campaignFolder;
const statePath = configPath.replace(/(\.json)?$/, '.state.json');
const state = existsSync(statePath) ? readJson(statePath, 'state file') : {};
const cli = process.env.META_ADS_CLI || 'meta';

// ---- Checks -----------------------------------------------------------------

const problems = [];
for (const key of ['manifest', 'distDir', 'campaignFolder', 'startTime']) {
  if (!cfg[key]) problems.push(`set "${key}" in the config`);
}
for (const key of ['pageId', 'appId', 'appStoreUrl']) {
  if (!cfg[key] || String(cfg[key]).startsWith('REPLACE_')) problems.push(`set "${key}" in the config`);
}
if (!Number.isInteger(cfg.dailyBudgetCents) || cfg.dailyBudgetCents <= 0) {
  problems.push('"dailyBudgetCents" must be a positive whole number');
}
if (!Array.isArray(cfg.countries) || cfg.countries.length === 0) {
  problems.push('"countries" must list at least one country code');
}
if (!['short', 'long'].includes(cfg.copy)) problems.push('"copy" must be "short" or "long"');
if (cfg.optimizationGoal === 'OFFSITE_CONVERSIONS' && !cfg.customEventType) {
  problems.push('"customEventType" is required when optimizationGoal is OFFSITE_CONVERSIONS');
}
if (!cfg.manifest) fail(problems.join('\n  '));

// ---- Read the ads -----------------------------------------------------------

const manifest = readJson(path.resolve(base, cfg.manifest), 'manifest');
const ads = new Map(); // one entry per ad, whatever the image size
let skippedCarousels = 0;
for (const creative of manifest.creatives ?? []) {
  if (creative.carousel) {
    skippedCarousels += 1;
    continue;
  }
  if (!ads.has(creative.id)) ads.set(creative.id, creative);
}
const adSets = new Map();
for (const ad of ads.values()) {
  const name = ad.adSet ?? 'default';
  if (!adSets.has(name)) adSets.set(name, []);
  adSets.get(name).push(ad);
}
if (ads.size === 0) problems.push('the manifest has no single-image creatives');

const imageFor = (ad) => {
  const stem = path.resolve(base, cfg.distDir ?? '', cfg.campaignFolder ?? '', ad.adSet ?? 'default', ad.id, `${ad.id}_${cfg.imageSize}`);
  return ['.jpg', '.png'].map((extension) => stem + extension).find((file) => existsSync(file)) ?? `${stem}.jpg`;
};
const textFor = (ad) => (cfg.copy === 'long' && ad.primaryTextLong ? ad.primaryTextLong : ad.primaryText);
for (const ad of ads.values()) {
  if (!existsSync(imageFor(ad))) problems.push(`missing image: ${imageFor(ad)}`);
  if (!textFor(ad)) problems.push(`creative ${ad.id} has no primary text`);
}

// ---- The commands -----------------------------------------------------------

const targeting = JSON.stringify({ geo_locations: { countries: cfg.countries }, user_os: [cfg.os] });
const promotedObject = JSON.stringify({
  application_id: String(cfg.appId),
  object_store_url: cfg.appStoreUrl,
  ...(cfg.customEventType ? { custom_event_type: cfg.customEventType } : {})
});

const campaignArgs = () => [
  'ads', 'campaign', 'create',
  '--name', cfg.campaignName,
  '--objective', 'OUTCOME_APP_PROMOTION',
  '--status', 'PAUSED',
  ...(cfg.skadnetworkAttribution ? ['--skadnetwork-attribution'] : [])
];

const adSetArgs = (name, campaignId) => [
  'ads', 'adset', 'create',
  '--campaign-id', campaignId,
  '--name', name,
  '--optimization-goal', cfg.optimizationGoal,
  '--billing-event', 'IMPRESSIONS',
  '--bid-strategy', 'LOWEST_COST_WITHOUT_CAP',
  '--daily-budget', String(cfg.dailyBudgetCents),
  '--start-time', cfg.startTime,
  ...(cfg.endTime ? ['--end-time', cfg.endTime] : []),
  '--targeting', targeting,
  '--promoted-object', promotedObject,
  '--status', 'PAUSED'
];

const creativeArgs = (ad) => [
  'ads', 'creative', 'create',
  '--name', ad.id,
  '--page-id', String(cfg.pageId),
  ...(cfg.instagramUserId ? ['--instagram-user-id', String(cfg.instagramUserId)] : []),
  '--image', imageFor(ad),
  '--body', textFor(ad) ?? '',
  ...(ad.headline ? ['--title', ad.headline] : []),
  ...(ad.description ? ['--description', ad.description] : []),
  '--link-url', cfg.appStoreUrl,
  '--call-to-action', cfg.callToAction
];

const adArgs = (ad, adSetId, creativeId) => [
  'ads', 'ad', 'create',
  '--adset-id', adSetId,
  '--name', ad.id,
  '--creative-id', creativeId,
  '--status', 'PAUSED'
];

// ---- Running ----------------------------------------------------------------

const quote = (value) => (/^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`);
const show = (cliArgs) => console.log(`  meta ${cliArgs.map(quote).join(' ')}\n`);

const findId = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return findId(value[0]);
  if (value.id) return String(value.id);
  for (const child of Object.values(value)) {
    const id = findId(child);
    if (id) return id;
  }
  return null;
};

const call = (cliArgs) => {
  try {
    return execFileSync(cli, ['--no-input', '--output', 'json', ...cliArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (error.code === 'ENOENT') return fail(`the "${cli}" command is not installed; see docs/app-install-setup.md`);
    return fail(`meta ${cliArgs.slice(0, 3).join(' ')} failed (exit ${error.status}).\n${error.stderr || error.stdout || error.message}`);
  }
};

// Creates the object once; later runs reuse the saved ID.
const once = (key, label, cliArgs) => {
  if (state[key]) {
    console.log(`  already made: ${label} (${state[key]})`);
    return state[key];
  }
  const out = call(cliArgs);
  let id = null;
  try {
    id = findId(JSON.parse(out));
  } catch {
    id = (out.match(/\b\d{10,}\b/) || [])[0] || null;
  }
  if (!id) fail(`could not find an ID in the output of meta ${cliArgs.slice(0, 3).join(' ')}:\n${out}`);
  state[key] = id;
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`  made ${label} (${id})`);
  return id;
};

// ---- Go ---------------------------------------------------------------------

console.log(`Campaign "${cfg.campaignName}": ${adSets.size} ad sets, ${ads.size} ads, all PAUSED.`);
console.log(`Each ad set: ${(cfg.dailyBudgetCents / 100).toFixed(2)}/day in the ad account's currency, from ${cfg.startTime}${cfg.endTime ? ` to ${cfg.endTime}` : ''}, ${(cfg.countries ?? []).join(' + ')}, ${cfg.os}.`);
if (skippedCarousels) console.log(`Skipped ${skippedCarousels} carousel images; build carousels by hand.`);
console.log('');

if (!RUN && !VALIDATE) {
  console.log('Nothing is being created. These are the commands --run would use:\n');
  show(campaignArgs());
  for (const [name, list] of adSets) {
    show(adSetArgs(name, '<CAMPAIGN_ID>'));
    for (const ad of list) {
      show(creativeArgs(ad));
      show(adArgs(ad, '<AD_SET_ID>', '<CREATIVE_ID>'));
    }
  }
  if (problems.length) console.log(`Fix before --run:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  process.exit(0);
}

if (problems.length) fail(`fix these first:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);

if (VALIDATE) {
  const out = call([...campaignArgs(), '--execution-options', 'validate_only']);
  console.log(`Meta accepted the campaign settings. Nothing was created.\n${out}`);
  process.exit(0);
}

const campaignId = once('campaign', `campaign ${cfg.campaignName}`, campaignArgs());
for (const [name, list] of adSets) {
  const adSetId = once(`adset:${name}`, `ad set ${name}`, adSetArgs(name, campaignId));
  for (const ad of list) {
    const creativeId = once(`creative:${ad.id}`, `creative ${ad.id}`, creativeArgs(ad));
    once(`ad:${ad.id}`, `ad ${ad.id}`, adArgs(ad, adSetId, creativeId));
  }
}
console.log(`\nDone. Everything is paused. IDs are in ${statePath}`);

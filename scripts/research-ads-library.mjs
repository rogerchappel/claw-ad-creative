#!/usr/bin/env node
// Pull live competitor ads from the public Meta Ad Library through Apify's
// Facebook Ads Library scraper, behind a cost estimate and a spend cap.
//
// Meta's own Ad Library API only returns ordinary commercial ads that ran in the
// EU or UK, so for other markets a scraper of the public library is the practical
// route. Nothing is spent without --confirm, and no flag can go past the owner's
// per-run ceiling (APIFY_MAX_USD, default 5).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const ACTOR = 'apify~facebook-ads-scraper';
// Free-plan rate read from https://apify.com/apify/facebook-ads-scraper/pricing
// on 2026-11-19. Paid plans pay less. Override with --price-per-ad if it changes.
const DEFAULT_PRICE_PER_AD = 0.0058;
const DEFAULT_ITEMS = 100;
const DEFAULT_CEILING_USD = 5;
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
const LIBRARY = 'https://www.facebook.com/ads/library/';

const API = localOnly(process.env.APIFY_BASE_URL) ?? 'https://api.apify.com/v2';

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      keyword: { type: 'string', multiple: true },
      page: { type: 'string', multiple: true },
      competitors: { type: 'string' },
      'per-search': { type: 'string' },
      country: { type: 'string', default: 'US' },
      'max-items': { type: 'string' },
      'max-usd': { type: 'string' },
      'price-per-ad': { type: 'string', default: String(DEFAULT_PRICE_PER_AD) },
      'wait-minutes': { type: 'string', default: '20' },
      out: { type: 'string' },
      confirm: { type: 'boolean', default: false },
      'allow-larger': { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  }));
} catch (error) {
  fail(error.message);
}

if (options.help) {
  printHelp();
  process.exit(0);
}

try {
  process.exitCode = options.check ? await check() : await research();
} catch (error) {
  fail(error.message);
}

async function research() {
  const urls = searchUrls();
  const perSearch = options['per-search'] ? positiveInteger(options['per-search'], '--per-search') : null;
  const maxItems = options['max-items'] ? positiveInteger(options['max-items'], '--max-items') : perSearch ? perSearch * urls.length : DEFAULT_ITEMS;
  const pricePerAd = positiveNumber(options['price-per-ad'], '--price-per-ad');
  const ceiling = spendCeiling();
  const estimate = round(maxItems * pricePerAd);
  const cap = options['max-usd'] ? positiveNumber(options['max-usd'], '--max-usd') : Math.min(ceiling, Math.max(0.05, Math.ceil(estimate * 120) / 100));

  console.log(`Searches: ${urls.length}, up to ${Math.max(1, Math.floor(maxItems / urls.length))} ads each, ${maxItems} in total.`);
  console.log(`Estimate: about $${estimate.toFixed(2)} at $${pricePerAd} per ad. The run stops at ${maxItems} ads or $${cap.toFixed(2)}, whichever comes first.`);
  console.log(`Ceiling for one run: $${ceiling.toFixed(2)} (APIFY_MAX_USD). Prices: https://apify.com/apify/facebook-ads-scraper/pricing`);

  if (maxItems > DEFAULT_ITEMS && !options['allow-larger']) {
    console.log(`Not started: more than ${DEFAULT_ITEMS} ads needs the person's yes, then --allow-larger.`);
    return 4;
  }
  if (estimate > ceiling || cap > ceiling) {
    console.log(`Not started: this is over the $${ceiling.toFixed(2)} ceiling. Only the owner can raise it, by setting APIFY_MAX_USD.`);
    return 4;
  }
  if (estimate > cap) {
    console.log(`Not started: the estimate is above the $${cap.toFixed(2)} cap. Lower --max-items or raise --max-usd.`);
    return 4;
  }
  if (!options.confirm) {
    console.log('Preview only. Show this estimate to the person; if they say yes, run again with --confirm.');
    return 0;
  }
  if (!options.out) fail('--out is required with --confirm');

  const token = apifyToken();
  const input = { startUrls: urls.map((url) => ({ url })), resultsLimit: Math.max(1, Math.floor(maxItems / urls.length)), activeStatus: 'active' };
  const waitMinutes = positiveNumber(options['wait-minutes'], '--wait-minutes');
  const query = new URLSearchParams({ maxItems: String(maxItems), maxTotalChargeUsd: cap.toFixed(2), timeout: String(Math.round(waitMinutes * 60)) });
  let run = (await call(token, 'POST', `/acts/${ACTOR}/runs?${query}`, input)).data;
  console.log(`Started run ${run.id}.`);

  const deadline = Date.now() + waitMinutes * 60_000;
  while (!TERMINAL.has(run.status)) {
    if (Date.now() > deadline) {
      console.log('The run passed --wait-minutes, so it is being aborted to stop the spend.');
      run = (await call(token, 'POST', `/actor-runs/${run.id}/abort`, {})).data;
      break;
    }
    const wait = Math.max(1, Math.min(60, Math.round((deadline - Date.now()) / 1000)));
    run = (await call(token, 'GET', `/actor-runs/${run.id}?waitForFinish=${wait}`)).data;
  }

  let items = [];
  if (run.defaultDatasetId) {
    const found = await call(token, 'GET', `/datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=${maxItems}`);
    if (Array.isArray(found)) items = found.slice(0, maxItems);
  }
  mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(items, null, 1)}\n`);
  const receipt = { actor: ACTOR, runId: run.id, status: run.status, items: items.length, maxItems, capUsd: cap, estimateUsd: estimate, chargedUsd: run.usageTotalUsd ?? null, searches: urls };
  writeFileSync(options.out.replace(/\.json$/i, '') + '.run.json', `${JSON.stringify(receipt, null, 1)}\n`);
  const charged = typeof run.usageTotalUsd === 'number' ? `$${run.usageTotalUsd.toFixed(2)}` : 'see the Apify usage page';
  console.log(`Finished with status ${run.status}: ${items.length} ads saved to ${options.out}. Charged: ${charged}.`);
  if (run.status !== 'SUCCEEDED' && items.length) console.log('The run did not finish cleanly, often because it reached the cap. These results are partial.');
  return run.status === 'SUCCEEDED' || items.length ? 0 : 1;
}

async function check() {
  const token = apifyToken();
  const me = (await call(token, 'GET', '/users/me')).data ?? {};
  console.log(`Apify token works. Account: ${me.username ?? 'unnamed'}. Plan: ${me.plan?.id ?? 'unknown'}. Nothing was spent.`);
  return 0;
}

function searchUrls() {
  const list = options.competitors ? readCompetitors(options.competitors) : { pages: [], keywords: [] };
  options.page = [...list.pages, ...(options.page ?? [])];
  options.keyword = [...list.keywords, ...(options.keyword ?? [])];
  if (list.country && !process.argv.some((arg) => arg === '--country' || arg.startsWith('--country='))) options.country = list.country;
  const urls = [...new Set(options.keyword)].map((q) => `${LIBRARY}?${new URLSearchParams({ active_status: 'active', ad_type: 'all', country: options.country, q, search_type: 'keyword_unordered', media_type: 'all' })}`);
  for (const page of new Set(options.page)) {
    if (!/^https:\/\/(www\.)?facebook\.com\//i.test(page)) fail(`--page must be a https://www.facebook.com/ link: ${page}`);
    urls.push(page);
  }
  if (!urls.length) fail('give at least one --keyword or --page');
  return urls;
}

// competitors.json: { "country": "AU", "keywords": [...], "competitors": [{ "name", "page", "type", "why" }] }
function readCompetitors(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8').replace(/^\ufeff/, ''));
  } catch (error) {
    fail(`--competitors could not be read as JSON: ${error.message}`);
  }
  const entries = Array.isArray(data?.competitors) ? data.competitors : [];
  const missing = entries.filter((entry) => !entry?.page).map((entry) => entry?.name ?? '?');
  if (missing.length) console.log(`Skipped ${missing.length} competitors with no Facebook Page link: ${missing.join(', ')}. Find their Page, or search the Ad Library by hand.`);
  return { country: typeof data?.country === 'string' ? data.country : null, pages: entries.filter((entry) => entry?.page).map((entry) => entry.page), keywords: Array.isArray(data?.keywords) ? data.keywords : [] };
}

async function call(token, method, route, body) {
  let response;
  try {
    response = await fetch(API + route, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'claw-ad-creative' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(`could not reach Apify (${error.cause?.code ?? error.message})`);
  }
  if (!response.ok) throw new Error(httpMessage(response.status));
  return response.json();
}

function httpMessage(status) {
  if (status === 401) return 'Apify rejected the token. Copy it again from https://console.apify.com/settings/integrations';
  if (status === 402 || status === 403) return 'Apify says the account is out of credit or the plan does not allow this run. Check https://console.apify.com/billing';
  if (status === 404) return `Apify cannot find ${ACTOR}; it may have been renamed`;
  if (status === 429) return 'Apify is rate limiting; wait a minute and try again';
  return `Apify refused the request (HTTP ${status})`;
}

function apifyToken() {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) fail('APIFY_TOKEN is not set. Create a free account at https://console.apify.com/sign-up and put the token in your environment or secret store, never in chat or a committed file.');
  return token;
}

function spendCeiling() {
  const value = Number(process.env.APIFY_MAX_USD);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CEILING_USD;
}

// Tests point the client at a local server; any other host falls back to Apify,
// so a real token can never be sent somewhere unexpected.
function localOnly(value) {
  if (!value) return null;
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname) ? value.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${name} must be a whole number of at least 1`);
  return number;
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${name} must be a positive number`);
  return number;
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}

function fail(message) {
  console.error(`ERROR: ${message}\nRun with --help for usage.`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  research-ads-library.mjs --keyword "<words>" [--keyword ...] [--page https://www.facebook.com/<page>] [options]
  research-ads-library.mjs --check

Pulls live ads from the public Meta Ad Library with Apify. Without --confirm it only
prints the estimate. Needs APIFY_TOKEN in the environment.

Options:
  --keyword <words>     Ad Library keyword search (repeatable)
  --page <url>          A competitor's Facebook Page link (repeatable)
  --competitors <file>  competitors.json: pages, keywords and country in one list
  --per-search <n>      Ads per page or keyword; sets --max-items to n x searches
  --country <code>      Country the ads are delivered in (default US)
  --max-items <n>       Most ads to pull in total (default ${DEFAULT_ITEMS}; more needs --allow-larger)
  --max-usd <usd>       Cap for this run (default: estimate + 20%, within the ceiling)
  --price-per-ad <usd>  Override the per-ad price (default ${DEFAULT_PRICE_PER_AD})
  --wait-minutes <n>    Abort the run after this long (default 20)
  --out <file.json>     Where to save the ads (required with --confirm)
  --confirm             The person approved the estimate; start the run
  --allow-larger        The person approved more than ${DEFAULT_ITEMS} ads
  --check               Prove the token works without spending anything

Environment:
  APIFY_TOKEN           Apify API token (never printed)
  APIFY_MAX_USD         Owner's ceiling for one run (default ${DEFAULT_CEILING_USD})`);
}

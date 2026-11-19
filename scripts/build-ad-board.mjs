#!/usr/bin/env node
// Turn competitors' live Meta ads into a board ranked by days running.
//
// Input is what research-ads-library.mjs saved (Apify's Ad Library items) or a
// list written by hand from the Ad Library:
//   [{ "advertiser": "...", "started": "Oct 21, 2026", "library_id": "...", "format": "Video",
//      "headline": "...", "copy": "...", "cta": "...", "landing_page": "https://...", "image": "https://..." }]
//
// A long run is a signal the ad pays for itself, because advertisers stop paying
// for ads that lose money. It is an inference, not a measurement: Meta publishes
// no results for ordinary commercial ads.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const LONG_RUN_DAYS = 90;
const PAST_TESTING_DAYS = 30;
const NEW_DAYS = 7;
const TEMPLATE = /\{\{[^}]*\}\}/;
const LIBRARY = 'https://www.facebook.com/ads/library/';
const CSV_COLUMNS = ['rank', 'days_running', 'signal', 'advertiser', 'format', 'dynamic', 'variations', 'headline', 'copy', 'cta', 'landing_page', 'image', 'video', 'started', 'library_link', 'id'];

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      items: { type: 'string' },
      out: { type: 'string' },
      previous: { type: 'string' },
      competitors: { type: 'string' },
      drop: { type: 'string', multiple: true },
      today: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false }
    }
  }));
} catch (error) {
  fail(error.message);
}
if (options.help) {
  console.log(`Usage:
  build-ad-board.mjs --items items.json --out <folder> [--competitors competitors.json] [--drop <advertiser>]
                    [--previous <folder>/board.json] [--today YYYY-MM-DD]

Writes ad-board.html, ads.csv and board.json.
  --competitors   keep only advertisers named in this list (name or aliases); the rest
                  are counted and set aside. Keyword searches pull in unrelated advertisers.
  --drop          set aside one advertiser by name (repeatable)
  --previous      mark long runners from an earlier board that have since stopped ("gone")`);
  process.exit(0);
}
if (!options.items || !options.out) fail('--items and --out are required');

const today = options.today ? parseDate(options.today) : new Date(new Date().toISOString().slice(0, 10));
if (!today) fail('--today must look like 2026-11-04');

const raw = readJson(options.items, '--items');
if (!Array.isArray(raw)) fail('--items must be a JSON array');
// Apify adds one record per search that found nothing ({ inputUrl, results: [], totalCount: 0 })
// or failed ({ url, error }). They are findings about the search, not ads.
const records = raw.filter((item) => item && typeof item === 'object');
const isEmptySearch = (item) => 'totalCount' in item && Array.isArray(item.results) && !item.results.length;
const isFailedSearch = (item) => 'error' in item && !('snapshot' in item);
const list = options.competitors ? readJson(options.competitors, '--competitors') : null;
const pageNames = new Map((Array.isArray(list) ? list : list?.competitors ?? []).filter((entry) => entry?.page).map((entry) => [entry.page.replace(/\/$/, ''), entry.name]));
const searchName = (url) => pageNames.get(String(url ?? '').replace(/\/$/, '')) ?? String(url ?? 'unknown search');
const noAds = records.filter(isEmptySearch).map((item) => searchName(item.inputUrl));
const failed = records.filter(isFailedSearch).map((item) => ({ search: searchName(item.url), reason: String(item.errorDescription ?? item.error) }));
const normalized = records.filter((item) => !isEmptySearch(item) && !isFailedSearch(item)).map(normalize);
const undated = normalized.filter((ad) => !ad).length;
const ended = normalized.filter((ad) => ad && !ad.active).length;
const keep = list ? competitorNames(list) : null;
const dropped = new Set((options.drop ?? []).map(nameKey));
const onList = (ad) => !dropped.has(nameKey(ad.advertiser)) && (!keep || keep.has(nameKey(ad.advertiser)));
const offList = normalized.filter((ad) => ad?.active && !onList(ad));
const live = normalized.filter((ad) => ad?.active && onList(ad));
const ads = rank(dedupe(live));

const gone = [];
if (options.previous) {
  const before = readJson(options.previous, '--previous');
  const seen = new Set(ads.map((ad) => ad.id));
  for (const ad of before.ads ?? []) {
    if (!seen.has(ad.id) && ad.days_running >= PAST_TESTING_DAYS) gone.push({ ...ad, signal: 'gone' });
  }
}

mkdirSync(options.out, { recursive: true });
const summary = { built: isoDate(today), live: ads.length, advertisers: new Set(ads.map((ad) => ad.advertiser)).size, longRunning: ads.filter((ad) => ad.signal === 'long-running').length, dynamic: ads.filter((ad) => ad.dynamic).length, ended, undated, offList: offList.length, offListAdvertisers: [...new Set(offList.map((ad) => ad.advertiser))].sort(), noLiveAds: noAds, failedSearches: failed, mergedCopies: live.length - ads.length, gone: gone.length };
writeFileSync(path.join(options.out, 'board.json'), `${JSON.stringify({ summary, note: inferenceNote(), ads, gone }, null, 1)}\n`);
writeFileSync(path.join(options.out, 'ads.csv'), `﻿${[CSV_COLUMNS, ...ads.map((ad) => CSV_COLUMNS.map((key) => ad[key]))].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`);
writeFileSync(path.join(options.out, 'ad-board.html'), page(ads, gone, summary));

console.log(`${raw.length} ads in. Set aside ${ended} that have ended, ${undated} with no start date and ${offList.length} from ${summary.offListAdvertisers.length} advertisers not on the list. Merged ${summary.mergedCopies} copies. ${ads.length} live ads from ${summary.advertisers} advertisers on the board.`);
if (ads.length) console.log(`Longest run: ${ads[0].days_running} days (${ads[0].advertiser}).`);
if (noAds.length) console.log(`${noAds.length} searches found no live ads: ${noAds.join(', ')}.`);
if (failed.length) console.log(`${failed.length} searches failed: ${failed.map((f) => `${f.search} (${f.reason})`).join('; ')}.`);
if (gone.length) console.log(`${gone.length} ads from the previous board have stopped.`);
console.log(`Wrote ${path.join(options.out, 'ad-board.html')}, ads.csv and board.json.`);
if (!ads.length) process.exitCode = 1;

function normalize(item) {
  const hand = 'advertiser' in item && !('snapshot' in item);
  const snap = hand ? {} : (item.snapshot ?? {});
  const cards = Array.isArray(snap.cards) ? snap.cards : [];
  const card = cards[0] ?? {};
  const started = parseDate(hand ? item.started : item.startDateFormatted ?? item.startDate);
  const copy = String(hand ? item.copy ?? '' : (typeof snap.body === 'object' ? snap.body?.text : snap.body) ?? card.body ?? '').trim();
  const headline = String(hand ? item.headline ?? '' : snap.title ?? card.title ?? '').trim();
  const advertiser = String((hand ? item.advertiser : item.pageName ?? snap.pageName) ?? 'Unknown');
  const id = String((hand ? item.library_id : item.adArchiveID ?? item.adArchiveId) ?? '').trim() || `hand-${hashText(`${advertiser}|${headline}|${copy}`)}`;
  if (!started) return null;
  // Catalog and dynamic ads store placeholders; Meta fills in the real text per viewer.
  const dynamic = TEMPLATE.test(`${headline} ${copy}`);
  const images = hand ? [{ url: item.image }] : [...(snap.images ?? []), ...cards, ...(snap.videos ?? [])].map((x) => ({ url: x?.resizedImageUrl ?? x?.originalImageUrl ?? x?.videoPreviewImageUrl }));
  const videos = hand ? [{ url: item.video }] : [...(snap.videos ?? []), ...cards].map((x) => ({ url: x?.videoHdUrl ?? x?.videoSdUrl }));
  return {
    id,
    advertiser,
    active: (hand ? item.active : item.isActive) !== false,
    started: isoDate(started),
    days_running: Math.max(0, Math.round((today - started) / 86_400_000)),
    format: formatName(hand ? item.format : snap.displayFormat, cards.length),
    dynamic,
    headline,
    copy,
    cta: String(hand ? item.cta ?? '' : snap.ctaText ?? card.ctaText ?? '').trim(),
    landing_page: webUrl(hand ? item.landing_page : snap.linkUrl ?? card.linkUrl),
    image: images.map((x) => webUrl(x.url)).find(Boolean) ?? '',
    video: videos.map((x) => webUrl(x.url)).find(Boolean) ?? '',
    group: String(item.collationId ?? ''),
    variations: Number.isInteger(item.collationCount) && item.collationCount > 1 ? item.collationCount : 1,
    library_link: id.startsWith('hand-') ? LIBRARY : `${LIBRARY}?id=${encodeURIComponent(id)}`
  };
}

// One row per creative: rows in the same Meta collation group, or with the same
// advertiser and words, collapse into the longest-running one.
function dedupe(list) {
  const owners = new Map();
  const kept = [];
  for (const ad of [...list].sort((a, b) => b.days_running - a.days_running)) {
    // Template text is the same across an advertiser's dynamic ads, so it can't identify a creative.
    const words = ad.dynamic ? '' : `${ad.headline} ${ad.copy}`.toLowerCase().replace(/\W+/g, ' ').trim();
    const keys = [`id:${ad.id}`, ad.group && `group:${ad.group}`, words && `words:${ad.advertiser.toLowerCase()}|${words}`].filter(Boolean);
    const owner = keys.map((key) => owners.get(key)).find(Boolean);
    if (owner) {
      owner.copies += 1;
      owner.variations = Math.max(owner.variations, ad.variations, owner.copies + 1);
      for (const field of ['image', 'video', 'landing_page', 'cta', 'headline']) owner[field] ||= ad[field];
    } else {
      kept.push(Object.assign(ad, { copies: 0 }));
    }
    for (const key of keys) owners.set(key, owner ?? ad);
  }
  return kept;
}

function rank(list) {
  list.sort((a, b) => b.days_running - a.days_running || b.variations - a.variations || a.advertiser.localeCompare(b.advertiser) || a.id.localeCompare(b.id));
  return list.map(({ group, copies, active, ...ad }, index) => ({ rank: index + 1, signal: signal(ad), ...ad }));
}

function signal(ad) {
  if (ad.days_running >= LONG_RUN_DAYS) return 'long-running';
  if (ad.days_running >= PAST_TESTING_DAYS) return 'past-testing';
  if (ad.days_running <= NEW_DAYS) return 'new-this-week';
  return 'testing';
}

function nameKey(name) {
  return String(name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function competitorNames(data) {
  const list = Array.isArray(data) ? data : data?.competitors;
  if (!Array.isArray(list)) fail('--competitors must be a list, or an object with a "competitors" list');
  const names = new Set(list.flatMap((entry) => (typeof entry === 'string' ? [entry] : [entry?.name, ...(entry?.aliases ?? [])])).filter(Boolean).map(nameKey));
  if (!names.size) fail('--competitors has no names');
  return names;
}

function formatName(raw, cardCount) {
  const code = String(raw || (cardCount > 1 ? 'CAROUSEL' : 'UNKNOWN')).toUpperCase();
  const names = { DCO: 'Dynamic', DPA: 'Catalog', MULTI_IMAGES: 'Carousel', MULTI_VIDEOS: 'Carousel' };
  return names[code] ?? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}

function parseDate(value) {
  if (typeof value === 'number' && value > 0) return new Date(new Date(value * 1000).toISOString().slice(0, 10));
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.replace(/started running on/i, '').trim();
  const iso = text.match(/^\d{4}-\d{2}-\d{2}/);
  const date = new Date(iso ? iso[0] : `${text} UTC`);
  return Number.isNaN(date.getTime()) ? null : new Date(date.toISOString().slice(0, 10));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function webUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

function hashText(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return hash.toString(16);
}

// Spreadsheet apps run cells that start with these characters as formulas.
function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function readJson(file, name) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    fail(`${name} could not be read as JSON: ${error.message}`);
  }
}

function inferenceNote() {
  return 'Ranked by days running. A long run suggests the ad pays for itself, because advertisers stop paying for ads that lose money. That is an inference, not a result: Meta publishes no results for these ads.';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function card(ad) {
  const links = [['Video', ad.video], ['Image', ad.image], ['Landing page', ad.landing_page], ['Ad Library', ad.library_link]]
    .filter(([, url]) => url).map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('');
  return `<article data-who="${esc(ad.advertiser)}" data-signal="${esc(ad.signal)}">
<div class="thumb">${ad.image ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(ad.image)}" alt="">` : 'No image'}<span class="fmt">${esc(ad.format)}</span></div>
<div class="body"><div class="top"><b class="days">${ad.days_running}<small> days</small></b><span>#${ad.rank ?? '–'}</span></div>
<div class="sig ${esc(ad.signal)}">${esc(ad.signal.replace(/-/g, ' '))}${ad.variations > 1 ? ` · ${ad.variations} versions` : ''}</div>
<div class="who">${esc(ad.advertiser)}</div>${ad.dynamic ? '<p class="copy dyn">Dynamic ad: the text and image vary per viewer, so the Ad Library only stores a template.</p>' : `${ad.headline ? `<div class="head">${esc(ad.headline)}</div>` : ''}<p class="copy">${esc(ad.copy)}</p>`}
<div class="meta">${ad.cta ? `<b>${esc(ad.cta)}</b>` : ''}${links}</div></div></article>`;
}

function page(list, stopped, summary) {
  const advertisers = [...new Set(list.map((ad) => ad.advertiser))].sort((a, b) => a.localeCompare(b));
  const chip = (value, label, pressed) => `<button class="chip" data-v="${esc(value)}" aria-pressed="${pressed}">${esc(label)}</button>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ad Board</title>
<style>
:root{--bg:#f4f4f2;--card:#fff;--ink:#17181a;--soft:#62656b;--line:#dcdcd8;--accent:#b4532a;--chip:#ececE8}
@media (prefers-color-scheme:dark){:root{--bg:#141517;--card:#1e2023;--ink:#ecedef;--soft:#a2a5ab;--line:#33363a;--accent:#e8895f;--chip:#2a2c30}}
[hidden]{display:none!important}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
header,main,section{max-width:1320px;margin:auto;padding:16px}h1{margin:8px 0 4px}h2{margin:24px 0 8px}.note{color:var(--soft);max-width:760px}
.stats{display:flex;flex-wrap:wrap;gap:24px;margin:12px 0}.stats b{display:block;font-size:24px}.stats span{color:var(--soft);font-size:13px}
.bar{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}input{flex:1 1 220px;min-width:0;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font:inherit}
.chip{border:1px solid var(--line);background:var(--chip);color:var(--ink);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}.chip[aria-pressed=true]{background:var(--ink);color:var(--bg)}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}article{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.thumb{aspect-ratio:1;background:var(--chip);display:flex;align-items:center;justify-content:center;color:var(--soft);position:relative}.thumb img{width:100%;height:100%;object-fit:cover}
.fmt{position:absolute;left:10px;top:10px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;padding:3px 8px;border-radius:6px}
.body{padding:14px;display:flex;flex-direction:column;gap:6px;flex:1}.top{display:flex;justify-content:space-between;color:var(--soft)}.days{font-size:22px;color:var(--ink)}.days small{font-size:12px;font-weight:400;color:var(--soft)}
.sig{font-size:12px;color:var(--soft);text-transform:capitalize}.sig.long-running{color:var(--accent);font-weight:600}.who,.head{font-weight:600;overflow-wrap:anywhere}
.dyn{color:var(--soft);font-style:italic}.copy{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:9.5em;overflow:auto}.meta{margin-top:auto;padding-top:8px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:6px 12px;font-size:13px}a{color:var(--accent)}
</style></head><body>
<header><h1>Ad Board</h1><p class="note">${esc(inferenceNote())} Image and video links expire; save anything worth keeping.</p>
<div class="stats"><div><b>${summary.live}</b><span>Live ads</span></div><div><b>${summary.advertisers}</b><span>Advertisers</span></div><div><b>${summary.longRunning}</b><span>${LONG_RUN_DAYS}+ days</span></div><div><b>${list[0]?.days_running ?? 0}</b><span>Longest run</span></div><div><b>${summary.gone}</b><span>Stopped since last board</span></div><div><b>${summary.offList}</b><span>Ads set aside (not competitors)</span></div></div>
<div class="bar"><input type="search" id="q" placeholder="Search the copy" aria-label="Search the copy"></div>
<div class="bar" id="sig">${chip('', 'All signals', true)}${['long-running', 'past-testing', 'testing', 'new-this-week'].map((s) => chip(s, s.replace(/-/g, ' '), false)).join('')}</div>
<div class="bar" id="who">${chip('', 'All advertisers', true)}${advertisers.map((a) => chip(a, a, false)).join('')}</div></header>
<main class="grid" id="grid">${list.map(card).join('')}</main>
${summary.noLiveAds.length || summary.failedSearches.length ? `<section><h2>Searched, no live ads</h2><p class="note">${esc(summary.noLiveAds.join(', ') || 'None')}</p>${summary.failedSearches.length ? `<p class="note">Failed: ${esc(summary.failedSearches.map((f) => `${f.search} (${f.reason})`).join('; '))}</p>` : ''}</section>` : ''}
${stopped.length ? `<section><h2>Stopped since the last board</h2><p class="note">These ran ${PAST_TESTING_DAYS}+ days and are no longer live. Something changed: fatigue, a new offer, stock, or a season ending.</p><div class="grid">${stopped.map(card).join('')}</div></section>` : ''}
<script>
(()=>{const q=document.getElementById('q'),cards=[...document.querySelectorAll('#grid article')];let s='',w='';
const run=()=>{const t=q.value.toLowerCase();cards.forEach(c=>{c.hidden=!((!s||c.dataset.signal===s)&&(!w||c.dataset.who===w)&&(!t||c.textContent.toLowerCase().includes(t)))})};
const wire=(id,set)=>{const box=document.getElementById(id);box.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;[...box.children].forEach(x=>x.setAttribute('aria-pressed',x===b));set(b.dataset.v);run()})};
wire('sig',v=>{s=v});wire('who',v=>{w=v});q.addEventListener('input',run);
document.querySelectorAll('.thumb img').forEach(i=>i.addEventListener('error',()=>i.replaceWith('Image link expired')));})();
</script></body></html>
`;
}

function fail(message) {
  console.error(`ERROR: ${message}\nRun with --help for usage.`);
  process.exit(1);
}

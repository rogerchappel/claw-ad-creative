#!/usr/bin/env node
// Check that new ad copy takes competitors' angles, not their words.
//
// Flags any run of --words consecutive words (default 5) that our copy shares
// with a competitor ad. Exit codes: 0 clean, 2 overlaps found, 1 bad input.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      copy: { type: 'string' },
      against: { type: 'string' },
      words: { type: 'string', default: '5' },
      help: { type: 'boolean', short: 'h', default: false }
    }
  }));
} catch (error) {
  fail(error.message);
}
if (options.help) {
  console.log(`Usage:
  check-copy-overlap.mjs --copy <ours> --against <competitors> [--words 5]

--copy       meta-copy.csv from creative:render, a JSON list (strings or objects with
             primaryText, primaryTextLong, headline, description, copy or text), or a
             text file with one ad per blank-line-separated block
--against    board.json from research:board, research:ads items, or a hand-written list
--words      shortest shared phrase to flag (default 5)

Exit codes: 0 no shared phrases, 2 shared phrases found, 1 bad input.`);
  process.exit(0);
}
if (!options.copy || !options.against) fail('--copy and --against are required');
const size = Number(options.words);
if (!Number.isInteger(size) || size < 3) fail('--words must be a whole number of at least 3');

const ours = loadOurs(options.copy);
const theirs = loadTheirs(options.against);
if (!ours.length) fail('--copy has no ad text');
if (!theirs.length) fail('--against has no competitor ad text');

const index = new Map();
for (const ad of theirs) {
  for (const phrase of phrases(ad.text)) {
    if (!index.has(phrase)) index.set(phrase, new Set());
    index.get(phrase).add(ad.advertiser);
  }
}

let found = 0;
for (const ad of ours) {
  const shared = merge([...phrases(ad.text)].filter((phrase) => index.has(phrase)));
  if (!shared.length) continue;
  found += 1;
  console.log(`\n${ad.label}`);
  for (const phrase of shared) {
    const who = [...new Set(phrase.parts.flatMap((part) => [...index.get(part)]))].join(', ');
    console.log(`  "${phrase.text}"  (also in: ${who})`);
  }
}
console.log(found
  ? `\n${found} of ${ours.length} ads share wording with ${theirs.length} competitor ads. Rewrite those lines in your own words, from your own facts.`
  : `No shared phrases of ${size}+ words across ${ours.length} ads and ${theirs.length} competitor ads.`);
process.exitCode = found ? 2 : 0;

function words(text) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[‘’]/g, "'").match(/[\p{L}\p{N}']+/gu) ?? [];
}

function phrases(text) {
  const list = words(text);
  const set = new Set();
  for (let i = 0; i + size <= list.length; i += 1) set.add(list.slice(i, i + size).join(' '));
  return set;
}

// Join overlapping flagged phrases into the longest shared run, so one copied
// sentence is reported once.
function merge(list) {
  const runs = [];
  for (const phrase of list) {
    const last = runs.at(-1);
    const tail = last?.text.split(' ').slice(-(size - 1)).join(' ');
    if (last && phrase.startsWith(`${tail} `)) {
      last.text += ` ${phrase.split(' ').at(-1)}`;
      last.parts.push(phrase);
    } else {
      runs.push({ text: phrase, parts: [phrase] });
    }
  }
  return runs;
}

function loadOurs(file) {
  const text = read(file);
  if (/\.csv$/i.test(file)) {
    const [header = [], ...rows] = parseCsv(text);
    const fields = ['primaryText', 'primaryTextLong', 'headline', 'description'].map((name) => header.indexOf(name)).filter((i) => i !== -1);
    const name = header.indexOf('adName');
    if (!fields.length) fail('--copy CSV needs primaryText or headline columns (the meta-copy.csv that creative:render writes)');
    return rows.map((row, i) => ({ label: row[name] || `row ${i + 2}`, text: fields.map((f) => row[f]).join('\n') }));
  }
  if (/\.json$/i.test(file)) {
    const list = parseJson(text, '--copy');
    if (!Array.isArray(list)) fail('--copy JSON must be a list');
    return list.map((item, i) => typeof item === 'string'
      ? { label: `ad ${i + 1}`, text: item }
      : { label: item?.adName ?? item?.name ?? item?.id ?? `ad ${i + 1}`, text: ['primaryText', 'primaryTextLong', 'headline', 'description', 'copy', 'text'].map((k) => item?.[k] ?? '').join('\n') });
  }
  return text.split(/\n\s*\n/).map((block, i) => ({ label: `block ${i + 1}`, text: block })).filter((ad) => ad.text.trim());
}

function loadTheirs(file) {
  const data = parseJson(read(file), '--against');
  const list = Array.isArray(data) ? data : [...(data.ads ?? []), ...(data.gone ?? [])];
  return list.filter((ad) => ad && typeof ad === 'object').map((ad) => {
    const snap = ad.snapshot ?? {};
    const body = typeof snap.body === 'object' ? snap.body?.text : snap.body;
    const cards = (snap.cards ?? []).map((c) => `${c.title ?? ''}\n${c.body ?? ''}`).join('\n');
    // Dynamic ads only store {{placeholders}}; they carry no competitor wording to compare.
    const text = [ad.headline, ad.copy, snap.title, body, cards].filter(Boolean).join('\n').replace(/\{\{[^}]*\}\}/g, ' ');
    return { advertiser: ad.advertiser ?? ad.pageName ?? snap.pageName ?? 'unknown', text };
  }).filter((ad) => ad.text.trim());
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function read(file) {
  try {
    return readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch (error) {
    fail(`could not read ${file}: ${error.message}`);
  }
}

function parseJson(text, name) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${name} is not valid JSON: ${error.message}`);
  }
}

function fail(message) {
  console.error(`ERROR: ${message}\nRun with --help for usage.`);
  process.exit(1);
}

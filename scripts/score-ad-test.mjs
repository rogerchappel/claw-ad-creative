#!/usr/bin/env node
import { accessSync, constants, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}
for (const required of ['manifest', 'results']) {
  if (!options[required]) fail(`missing required --${required} path`);
  try {
    accessSync(options[required], constants.R_OK);
  } catch {
    fail(`--${required} must be a readable file`);
  }
}

const minImpressions = positiveNumber(options['min-impressions'] ?? '1000', '--min-impressions');
const minInstalls = positiveNumber(options['min-installs'] ?? '30', '--min-installs');
if (options.metric && !['installs', 'clicks'].includes(options.metric)) {
  fail('--metric must be installs or clicks');
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(options.manifest, 'utf8'));
} catch (error) {
  fail(`--manifest is not valid JSON: ${error.message}`);
}

const tests = new Map();
for (const row of manifest.creatives ?? []) {
  if (row.test) tests.set(row.id, row.test);
}
if (tests.size === 0) {
  fail('--manifest has no test data; render a job with a "matrix" first');
}

const rows = parseCsv(readFileSync(options.results, 'utf8').replace(/^﻿/, ''));
if (rows.length < 2) fail('--results has no data rows');
const header = rows[0].map((name) => name.trim());
const column = (...patterns) => {
  for (const pattern of patterns) {
    const index = header.findIndex((name) => pattern.test(name));
    if (index !== -1) return index;
  }
  return -1;
};
const columns = {
  name: column(/^ad name$/i),
  spend: column(/^amount spent/i, /^spend$/i),
  impressions: column(/^impressions$/i),
  clicks: column(/^link clicks$/i, /^clicks \(all\)$/i, /^clicks$/i),
  installs: column(/app installs/i, /^installs$/i, /^results$/i)
};
for (const key of ['name', 'spend', 'impressions']) {
  if (columns[key] === -1) fail(`--results is missing a column for ${key}; export Ad name, Amount spent, Impressions, Link clicks and App installs`);
}

// Longest id first, so a creative id that prefixes another can't claim its rows.
const ids = [...tests.keys()].sort((a, b) => b.length - a.length);
const totals = new Map();
const unmatched = new Set();
for (const row of rows.slice(1)) {
  const name = row[columns.name]?.trim();
  if (!name) continue;
  const id = ids.find((candidate) => name.split('__').includes(candidate)) ?? ids.find((candidate) => name.includes(candidate));
  if (!id) {
    unmatched.add(name);
    continue;
  }
  const total = totals.get(id) ?? { spend: 0, impressions: 0, clicks: 0, installs: 0 };
  for (const key of ['spend', 'impressions', 'clicks', 'installs']) {
    total[key] += number(row[columns[key]]);
  }
  totals.set(id, total);
}
if (totals.size === 0) fail('no rows in --results matched a creative id in --manifest');

const overall = sum([...totals.values()]);
const metric = options.metric ?? (overall.installs >= minInstalls ? 'installs' : 'clicks');
const factors = {
  hook: (test) => test.hook,
  layout: (test) => test.layout,
  cta: (test) => test.cta,
  ad: (test, id) => id
};
const report = Object.fromEntries(Object.entries(factors).map(([factor, keyOf]) => [factor, rank(keyOf)]).filter(([, levels]) => levels.length > 1));
const carry = (levels) => {
  const keepers = levels.filter((level) => ['winner', 'leaning ahead'].includes(level.verdict));
  return (keepers.length ? keepers : levels.filter((level) => level.verdict === 'no clear difference').slice(0, 2)).map((level) => level.level);
};
const next = Object.fromEntries(['hook', 'layout', 'cta'].filter((factor) => report[factor]).map((factor) => [factor, carry(report[factor])]));
const output = { metric, overall: withRates(overall), next, unmatched: [...unmatched], factors: report };

const outDir = path.resolve(options['out-dir'] ?? path.dirname(options.results));
writeFileSync(path.join(outDir, 'test-report.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
const markdown = toMarkdown(output);
writeFileSync(path.join(outDir, 'test-report.md'), markdown, 'utf8');
console.log(markdown);

function rank(keyOf) {
  const groups = new Map();
  for (const [id, total] of totals) {
    const key = keyOf(tests.get(id), id);
    if (key === null || key === undefined) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(total);
  }
  return [...groups]
    .map(([level, list]) => {
      const stats = sum(list);
      const rest = { impressions: overall.impressions - stats.impressions, count: overall[metric] - stats[metric] };
      return { level, ads: list.length, ...withRates(stats), verdict: verdictFor(stats, rest) };
    })
    .sort((a, b) => b[metric] / (b.impressions || 1) - a[metric] / (a.impressions || 1));
}

// Compares each level with everything else, per impression. The strict bar allows for
// checking many levels at once, where a chance result would otherwise look like a winner.
function verdictFor(stats, rest) {
  if (stats.impressions < minImpressions) return 'not enough data';
  const pooled = (stats[metric] + rest.count) / (stats.impressions + rest.impressions);
  const error = Math.sqrt(pooled * (1 - pooled) * (1 / stats.impressions + 1 / (rest.impressions || 1)));
  if (!error || !rest.impressions) return 'no clear difference';
  const z = (stats[metric] / stats.impressions - rest.count / rest.impressions) / error;
  if (z >= 2.58) return 'winner';
  if (z >= 1.64) return 'leaning ahead';
  if (z <= -2.58) return 'loser';
  if (z <= -1.64) return 'behind';
  return 'no clear difference';
}

function withRates(stats) {
  const ratio = (value, base, scale = 1) => (base ? Number(((value / base) * scale).toFixed(2)) : null);
  return { ...stats, spend: Number(stats.spend.toFixed(2)), cpm: ratio(stats.spend, stats.impressions, 1000), ctr: ratio(stats.clicks, stats.impressions, 100), cpc: ratio(stats.spend, stats.clicks), cpi: ratio(stats.spend, stats.installs) };
}

function sum(list) {
  return list.reduce((all, item) => ({ spend: all.spend + item.spend, impressions: all.impressions + item.impressions, clicks: all.clicks + item.clicks, installs: all.installs + item.installs }), { spend: 0, impressions: 0, clicks: 0, installs: 0 });
}

function toMarkdown({ metric: used, overall: all, next: carried, unmatched: missed, factors: found }) {
  const value = (item) => item ?? '–';
  const table = (levels) => `| Variant | Ads | Spend | Impr. | CPM | Clicks | CTR % | CPC | Installs | CPI | Verdict |\n|---|---|---|---|---|---|---|---|---|---|---|\n${levels.map((l) => `| ${l.level} | ${l.ads} | ${l.spend} | ${l.impressions} | ${value(l.cpm)} | ${l.clicks} | ${value(l.ctr)} | ${value(l.cpc)} | ${l.installs} | ${value(l.cpi)} | ${l.verdict} |`).join('\n')}`;
  const sections = Object.entries(found).filter(([factor]) => factor !== 'ad').map(([factor, levels]) => `## By ${factor}\n\n${table(levels)}`);
  const ads = found.ad ? `## Top 5 ads (too little data per ad to call alone)\n\n${table(found.ad.slice(0, 5))}` : '';
  const keep = Object.entries(carried).map(([factor, levels]) => `- ${factor}: ${levels.join(', ') || 'none yet'}`).join('\n');
  return `# Creative test report

Ranked by **${used}** per impression${used === 'clicks' ? ` (fewer than ${minInstalls} installs reported, so clicks stand in)` : ''}. Total: ${all.spend} spent, ${all.impressions} impressions, ${all.clicks} clicks, ${all.installs} installs.

## Carry into the next round

${keep}

${sections.join('\n\n')}

${ads}
${missed.length ? `\n## Rows that matched no creative\n\n${missed.map((name) => `- ${name}`).join('\n')}\n` : ''}`;
}

function parseCsv(text) {
  const result = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      result.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    result.push(row);
  }
  return result;
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`${label} must be a positive number`);
  return parsed;
}

function parseArgs(argv) {
  const known = new Set(['manifest', 'results', 'out-dir', 'metric', 'min-impressions', 'min-installs']);
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
  console.log(`Usage:
  npm run creative:score -- --manifest output/manifest.json --results meta-export.csv

Ranks each hook, layout and CTA from a test matrix, using a Meta Ads Manager CSV
export at ad level. Export Ad name, Amount spent, Impressions, Link clicks and
App installs. Writes test-report.md and test-report.json.

Variants are pooled, so a hook is judged across all its ads. Single ads rarely
have enough data to call alone.

Options:
  --manifest <path>        manifest.json from a render with a "matrix" (required).
  --results <path>         Meta CSV export (required).
  --out-dir <path>         Where to write reports (default: next to --results).
  --metric <name>          installs or clicks (default: installs once there are
                           enough, otherwise clicks).
  --min-installs <n>       Installs needed to rank on installs (default: 30).
  --min-impressions <n>    Impressions a variant needs for a verdict (default: 1000).`);
}

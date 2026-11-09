#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { accessSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sizes = { '1:1': '1080x1080', '4:5': '1080x1350', '9:16': '1080x1920' };
const options = parseArgs(process.argv.slice(2));
const imageFormat = options['image-format'] ?? 'jpeg';
const jpegQuality = Number(options['jpeg-quality'] ?? 88);

if (options.help) {
  printHelp();
  process.exit(0);
}
if (!['jpeg', 'png'].includes(imageFormat)) fail('--image-format must be jpeg or png');
if (!Number.isInteger(jpegQuality) || jpegQuality < 1 || jpegQuality > 100) fail('--jpeg-quality must be a whole number from 1 to 100');
if (!options.config) fail('missing required --config path');
assertReadable(options.config, '--config');

const configPath = path.resolve(options.config);
const configDir = path.dirname(configPath);
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
  fail(`--config is not valid JSON: ${error.message}`);
}
if (!Array.isArray(config.campaigns) || config.campaigns.length === 0) fail('config.campaigns must be a non-empty array');

const name = safeName(config.name ?? 'campaigns', 'config.name');
const outDir = path.resolve(options['out-dir'] ?? configDir);
const root = path.join(outDir, name);
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const summary = [];
const allRows = [];
for (const campaign of config.campaigns) {
  const folder = safeName(campaign.folder, 'campaign.folder');
  const campaignDir = path.join(root, folder);
  const manifestPaths = campaign.manifest ? [campaign.manifest].flat() : [];
  const rows = manifestPaths.flatMap((file) => readManifest(file));
  const groups = new Map();
  for (const row of rows) {
    const adSet = row.adSet ?? 'default';
    if (!groups.has(adSet)) groups.set(adSet, new Map());
    const adId = row.carousel?.id ?? row.id;
    if (!groups.get(adSet).has(adId)) groups.get(adSet).set(adId, []);
    groups.get(adSet).get(adId).push(row);
  }
  for (const adSet of Object.keys(campaign.adSets ?? {})) {
    if (!groups.has(adSet)) groups.set(adSet, new Map());
  }

  const adSetRows = [];
  const copyRows = [];
  let imageCount = 0;
  let adCount = 0;
  for (const [adSet, ads] of groups) {
    const adSetDir = path.join(campaignDir, safeName(adSet, 'adSet'));
    mkdirSync(adSetDir, { recursive: true });
    const settings = campaign.adSets?.[adSet] ?? {};
    writeFileSync(path.join(adSetDir, 'AD-SET.md'), adSetSheet(adSet, settings, campaign, ads), 'utf8');
    adSetRows.push({ adSet, settings, ads: ads.size });
    for (const [adId, files] of ads) {
      const adDir = path.join(adSetDir, safeName(adId, 'ad id'));
      mkdirSync(adDir, { recursive: true });
      for (const row of files) {
        imageCount += copyImage(row, adId, adDir);
      }
      writeFileSync(path.join(adDir, 'copy.txt'), copySheet(adId, files, campaign), 'utf8');
      copyRows.push(copyRow(campaign, adSet, adId, files));
      adCount += 1;
    }
  }
  mkdirSync(campaignDir, { recursive: true });
  writeFileSync(path.join(campaignDir, 'CAMPAIGN.md'), campaignSheet(campaign, adSetRows), 'utf8');
  writeFileSync(path.join(campaignDir, 'copy.csv'), toCsv(copyRows), 'utf8');
  allRows.push(...copyRows);
  summary.push({ folder, adSets: groups.size, ads: adCount, images: imageCount, campaign });
}

for (const file of config.include ?? []) {
  const source = path.resolve(configDir, file);
  assertReadable(source, `config.include ${file}`);
  exportImage(source, path.join(root, path.basename(file)));
}
writeFileSync(path.join(root, 'all-ads.csv'), toCsv(allRows), 'utf8');
writeFileSync(path.join(root, 'START-HERE.md'), startHere(summary), 'utf8');

const totals = summary.reduce((all, item) => ({ adSets: all.adSets + item.adSets, ads: all.ads + item.ads, images: all.images + item.images }), { adSets: 0, ads: 0, images: 0 });
console.log(`${summary.length} campaign(s), ${totals.adSets} ad set(s), ${totals.ads} ad(s), ${totals.images} image(s) in ${root}`);

if (!options['no-zip']) {
  const zipFile = `${name}.zip`;
  rmSync(path.join(outDir, zipFile), { force: true });
  const zipped = spawnSync('zip', ['-r', '-q', '-X', zipFile, name], { cwd: outDir, encoding: 'utf8' });
  if (zipped.error || zipped.status !== 0) fail(`could not create ${zipFile}: ${zipped.error?.message ?? zipped.stderr}`);
  console.log(`Wrote ${path.join(outDir, zipFile)}`);
}

function readManifest(file) {
  const manifestPath = path.resolve(configDir, file);
  assertReadable(manifestPath, `manifest ${file}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`manifest ${file} is not valid JSON: ${error.message}`);
  }
  return (manifest.creatives ?? []).map((row) => ({ ...row, baseDir: path.dirname(manifestPath) }));
}

function copyImage(row, adId, adDir) {
  if (!row.image) fail(`${row.id} has no image; render without --html-only first`);
  const source = path.join(row.baseDir, row.image);
  assertReadable(source, `image for ${row.id}`);
  const slug = row.format.replace(':', 'x');
  const card = row.carousel ? `card${row.carousel.position}_` : '';
  // Unique names keep files apart once they're all in Meta's media library.
  exportImage(source, path.join(adDir, `${adId}_${card}${slug}_${sizes[row.format] ?? 'image'}${path.extname(source)}`));
  return 1;
}

// PNGs become JPEGs because a full export is several times smaller and Meta accepts both.
function exportImage(source, target) {
  if (imageFormat !== 'jpeg' || path.extname(source).toLowerCase() !== '.png') {
    copyFileSync(source, target);
    return;
  }
  const output = `${target.slice(0, -path.extname(target).length)}.jpg`;
  const [tool, args] = converterFor(source, output);
  const result = spawnSync(tool, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0 || !existsSync(output)) {
    fail(`could not convert ${source} to JPEG: ${result.error?.message ?? result.stderr}`);
  }
}

function converterFor(source, output) {
  const onPath = (tool) => (process.env.PATH ?? '').split(path.delimiter).some((dir) => dir && existsSync(path.join(dir, tool)));
  if (onPath('sips')) return ['sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(jpegQuality), source, '--out', output]];
  if (onPath('magick')) return ['magick', [source, '-quality', String(jpegQuality), output]];
  if (onPath('convert')) return ['convert', [source, '-quality', String(jpegQuality), output]];
  return fail('JPEG export needs sips (macOS) or ImageMagick; install one, or pass --image-format png');
}

function copySheet(adId, files, campaign) {
  const first = files[0];
  const lines = [`AD NAME: ${adId}`, `AD SET: ${first.adSet}`, `TYPE: ${first.carousel ? `Carousel, ${files.length} cards` : `Single image: ${files.map((row) => row.format).join(', ')}`}`];
  if (campaign.copyNote) lines.push('', `NOTE: ${campaign.copyNote}`);
  lines.push('', 'PRIMARY TEXT (SHORT)', first.primaryText || '-');
  if (first.primaryTextLong) lines.push('', 'PRIMARY TEXT (LONG)', first.primaryTextLong);
  if (first.carousel) {
    lines.push('', 'CARDS');
    for (const row of [...files].sort((a, b) => a.carousel.position - b.carousel.position)) {
      lines.push(`${row.carousel.position}. ${row.carousel.headline || row.headline}${row.carousel.description ? ` | ${row.carousel.description}` : ''}`);
    }
  } else {
    lines.push('', 'HEADLINE', first.headline || '-');
  }
  lines.push('', 'DESCRIPTION', first.description || '-', '', 'BUTTON', first.cta || '-', '', 'URL', first.url || '-', '');
  return lines.join('\n');
}

function copyRow(campaign, adSet, adId, files) {
  const first = files[0];
  return {
    campaign: campaign.folder,
    adSet,
    ad: adId,
    type: first.carousel ? 'carousel' : 'single',
    primaryTextShort: first.primaryText,
    primaryTextLong: first.primaryTextLong,
    headline: first.carousel ? '' : first.headline,
    description: first.description,
    button: first.cta,
    url: first.url,
    hook: first.test?.hook ?? '',
    layout: first.test?.layout ?? '',
    ctaVariant: first.test?.cta ?? ''
  };
}

function campaignSheet(campaign, adSets) {
  const field = (label, value) => (value ? `- **${label}:** ${value}\n` : '');
  return `# ${campaign.folder}

${campaign.purpose ?? ''}

${field('Objective', campaign.objective)}${field('When', campaign.when)}${field('Budget', campaign.budget)}${field('Audience', campaign.audience)}${field('Placements', campaign.placements)}
| Ad set | Ads | Budget | When | Audience |
|---|---|---|---|---|
${adSets.map(({ adSet, settings, ads }) => `| ${adSet} | ${ads} | ${settings.budget ?? '–'} | ${settings.when ?? '–'} | ${settings.audience ?? '–'} |`).join('\n')}
`;
}

function adSetSheet(adSet, settings, campaign, ads) {
  const value = (key) => settings[key] ?? campaign[key] ?? '–';
  return `# ${adSet}

${settings.note ?? ''}

- **Budget:** ${value('budget')}
- **When:** ${value('when')}
- **Audience:** ${value('audience')}
- **Placements:** ${value('placements')}

Ads: ${ads.size ? [...ads.keys()].join(', ') : 'none yet'}
`;
}

function startHere(items) {
  return `# Start here

Folders follow Ads Manager: campaign, then ad set, then ad. Each ad folder holds its images and a \`copy.txt\`.

| Campaign | Ad sets | Ads | Images | When |
|---|---|---|---|---|
${items.map(({ folder, adSets, ads, images, campaign }) => `| ${folder} | ${adSets} | ${ads} | ${images} | ${campaign.when ?? '–'} |`).join('\n')}

${config.intro ?? ''}

\`all-ads.csv\` lists every ad's copy for reference. It isn't an Ads Manager bulk-import file.
`;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => cell(row[column])).join(',')).join('\n')}\n`;
}

// Names become folders, so they can't be allowed to climb out of the export.
function safeName(value, label) {
  if (typeof value !== 'string' || !value.trim() || /[/\\]|^\.+$/.test(value)) {
    fail(`${label} must be a name without slashes, got: ${value}`);
  }
  return value.trim();
}

function assertReadable(file, label) {
  try {
    accessSync(file, constants.R_OK);
  } catch {
    fail(`${label} must be a readable file: ${file}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--no-zip') {
      parsed['no-zip'] = true;
    } else if (['--config', '--out-dir', '--image-format', '--jpeg-quality'].includes(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) fail(`${arg} needs a value`);
      parsed[arg.slice(2)] = value;
      index += 1;
    } else {
      fail(`unrecognized option: ${arg}`);
    }
  }
  return parsed;
}

function fail(message) {
  console.error(`ERROR: ${message}\nRun with --help for usage.`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  npm run creative:package -- --config campaigns.json [--out-dir dist]

Packages rendered ads into folders that follow Ads Manager (campaign, ad set,
ad), with copy and setup notes at each level, and zips them.

Config:
  name       Folder and zip name.
  intro      Text for START-HERE.md.
  include    Extra files to copy to the top level.
  campaigns  List of: folder, purpose, objective, when, budget, audience,
             placements, copyNote, manifest (path or list of paths to
             manifest.json), adSets ({ "<ad set>": { budget, when, audience,
             placements, note } }). An ad set with no ads gets an empty folder
             with its notes, for ads you'll add later.

Options:
  --config <path>    Campaign config JSON (required). Paths are relative to it.
  --out-dir <path>   Where to write (default: next to the config).
  --no-zip           Write the folders only.
  --image-format <f> jpeg or png (default: jpeg). JPEG export needs sips
                     (macOS) or ImageMagick.
  --jpeg-quality <n> JPEG quality from 1 to 100 (default: 88).`);
}

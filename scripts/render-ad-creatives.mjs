#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const supportedOptions = new Set(['job', 'out-dir', 'chrome', 'only', 'html-only', 'concurrency']);
const booleanOptions = new Set(['html-only']);

const formats = {
  '1:1': { width: 1080, height: 1080, safeTop: 60, safeBottom: 60 },
  '4:5': { width: 1080, height: 1350, safeTop: 64, safeBottom: 64 },
  // Stories and Reels cover roughly the top 14% and bottom 20% with UI.
  '9:16': { width: 1080, height: 1920, safeTop: 270, safeBottom: 390 }
};

const templates = {
  device: renderDevice,
  photo: renderPhoto,
  post: renderPost,
  thread: renderThread,
  notes: renderNotes,
  screenshot: renderScreenshot,
  compare: renderCompare,
  statement: renderStatement
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.job) {
  fail('missing required --job path');
}
assertReadableRegularFile(args.job, '--job');

const jobPath = path.resolve(args.job);
const jobDir = path.dirname(jobPath);
let job;
try {
  job = JSON.parse(readFileSync(jobPath, 'utf8'));
} catch (error) {
  fail(`--job is not valid JSON: ${error.message}`);
}

const outDir = path.resolve(args['out-dir'] ?? path.join(jobDir, 'output'));
const concurrency = parseConcurrency(args.concurrency);
const brand = normaliseBrand(job.brand ?? {});
const defaults = job.defaults ?? {};
const assets = resolveAssets(job.assets ?? {});
const creatives = validateCreatives(job.creatives);
const selected = args.only ? creatives.filter((creative) => creative.id === args.only) : creatives;

if (args.only && selected.length === 0) {
  fail(`--only did not match any creative id: ${args.only}`);
}

const chrome = args['html-only'] ? null : findChrome(args.chrome);
if (!args['html-only'] && !chrome) {
  fail('could not find Chrome or Chromium; pass --chrome <path>, set CHROME_PATH, or use --html-only');
}

const jobs = [];
for (const creative of selected) {
  for (const formatKey of creative.formats) {
    const format = formats[formatKey];
    const slug = formatKey.replace(':', 'x');
    const html = documentFor(creative, format, formatKey);
    const htmlFile = path.join(outDir, 'html', `${creative.id}_${slug}.html`);
    const pngFile = path.join(outDir, slug, `${creative.id}.png`);
    mkdirSync(path.dirname(htmlFile), { recursive: true });
    mkdirSync(path.dirname(pngFile), { recursive: true });
    writeFileSync(htmlFile, html, 'utf8');
    jobs.push({ creative, formatKey, format, htmlFile, pngFile });
  }
}

if (chrome) {
  await runPool(jobs, concurrency, (item) => screenshot(chrome, item));
}

const manifest = jobs.map(({ creative, formatKey, htmlFile, pngFile }) => ({
  id: creative.id,
  adName: `${creative.adSet}__${creative.id}__${formatKey.replace(':', 'x')}`,
  adSet: creative.adSet,
  family: creative.family ?? null,
  style: creative.style ?? creative.template,
  template: creative.template,
  format: formatKey,
  image: chrome ? path.relative(outDir, pngFile) : null,
  html: path.relative(outDir, htmlFile),
  primaryText: creative.primaryText ?? '',
  headline: creative.metaHeadline ?? stripMarkup(creative.headline ?? ''),
  description: creative.description ?? defaults.description ?? '',
  cta: creative.metaCta ?? defaults.metaCta ?? 'LEARN_MORE',
  url: landingUrl(creative),
  hypothesis: creative.hypothesis ?? null,
  sources: creative.sources ?? []
}));

writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({ version: 1, brand: brand.name, generatedFrom: path.basename(jobPath), creatives: manifest }, null, 2)}\n`, 'utf8');
writeFileSync(path.join(outDir, 'meta-copy.csv'), toCsv(manifest), 'utf8');
writeFileSync(path.join(outDir, 'contact-sheet.html'), contactSheet(manifest), 'utf8');

console.log(`${manifest.length} creative file(s) for ${selected.length} concept(s) written to ${outDir}`);

function documentFor(creative, format, formatKey) {
  const body = templates[creative.template](creative, format, formatKey);
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>${baseCss(format)}</style>
</head><body class="t-${creative.template} f-${formatKey.replace(':', 'x')}${creative.theme ? ` theme-${creative.theme}` : ''}">
${body}
</body></html>
`;
}

function baseCss(format) {
  const { colors, fonts } = brand;
  const fontFaces = fonts
    .map((font) => `@font-face{font-family:'${font.family}';src:url('${pathToFileURL(font.file)}');font-weight:${font.weight ?? 400};}`)
    .join('');
  const display = fonts.find((font) => font.role === 'display')?.family;
  return `${fontFaces}
:root{--primary:${colors.primary};--deep:${colors.deep};--accent:${colors.accent};--light:${colors.light};--ink:${colors.ink};--muted:${colors.muted};--paper:${colors.paper};
--w:${format.width}px;--h:${format.height}px;--safe-top:${format.safeTop}px;--safe-bottom:${format.safeBottom}px;
--display:${display ? `'${display}',` : ''}-apple-system,'SF Pro Display','Helvetica Neue',Arial,sans-serif;
--text:-apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:var(--w);height:var(--h);overflow:hidden}
body{font-family:var(--text);color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}
.frame{position:relative;width:100%;height:100%;padding:calc(var(--safe-top) + 24px) 72px calc(var(--safe-bottom) + 24px);display:flex;flex-direction:column}
h1{font-family:var(--display);font-weight:800;letter-spacing:-0.02em;line-height:1.02}
h1 em{font-style:normal;color:var(--accent)}
.eyebrow{font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:26px;opacity:.75;margin-bottom:22px}
.body{font-size:34px;line-height:1.35;margin-top:24px;opacity:.85}
.logo{height:56px;width:auto;max-width:min(520px,100%);object-fit:contain;object-position:left center;display:block;align-self:flex-start}
.on-light h1 em{color:var(--primary)}
.slot{position:relative}
.slot>*{position:absolute;inset:0;margin:auto}
.brandline{display:flex;align-items:center;gap:16px;font-weight:700;font-size:30px}
.cta-row{display:flex;flex-wrap:wrap;align-items:center;gap:22px;margin-top:auto;padding-top:28px}
.cta{display:inline-flex;align-items:center;gap:12px;background:var(--accent);color:var(--deep);font-weight:800;font-size:34px;padding:22px 40px;border-radius:999px;white-space:nowrap}
.badge{height:72px;width:auto}
.phone{position:relative;border-radius:64px;background:#0b0f0e;padding:16px;box-shadow:0 40px 80px rgba(0,0,0,.35),inset 0 0 0 3px #2a302e}
.phone .screen{width:100%;height:100%;border-radius:50px;overflow:hidden;background:#fff}
.phone .screen img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.phone .island{position:absolute;top:34px;left:50%;transform:translateX(-50%);width:150px;height:40px;border-radius:30px;background:#0b0f0e;z-index:2}
.card-shot{border-radius:28px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.28);background:#fff}
.card-shot img{width:100%;height:100%;object-fit:cover;display:block}
`;
}

function renderDevice(c, format) {
  const dark = c.theme !== 'light';
  const shot = asset(c.screenshot, 'screenshot', c.id);
  const square = format.height === format.width;
  // The frame fills whatever height the copy leaves, so long headlines shrink the device instead of overlapping it.
  const frame = c.frame === 'card'
    ? `<div class="card-shot" style="${square ? 'width:100%;height:auto;max-height:100%' : 'height:100%;max-height:900px;max-width:100%'};aspect-ratio:${c.cardRatio ?? '0.8'}"><img src="${shot}" style="object-position:${c.crop ?? 'top center'}"></div>`
    : `<div class="phone" style="${square ? 'width:100%;height:auto;max-height:100%' : 'height:100%;max-height:1040px;max-width:100%'};aspect-ratio:0.48"><div class="island"></div><div class="screen"><img src="${shot}" style="object-position:${c.crop ?? 'top center'}"></div></div>`;
  const text = `<div>${logoLine(dark)}${c.eyebrow ? `<div class="eyebrow" style="margin-top:36px">${esc(c.eyebrow)}</div>` : ''}<h1 style="font-size:${square ? 76 : 92}px;${c.eyebrow ? '' : 'margin-top:36px'}">${markup(c.headline)}</h1>${c.body ? `<p class="body">${markup(c.body)}</p>` : ''}</div>`;
  const style = `background:${dark ? `radial-gradient(120% 80% at 80% 100%, var(--primary) 0%, var(--deep) 55%, #0c1d17 100%)` : 'var(--light)'};color:${dark ? '#fff' : 'var(--ink)'}`;
  const cls = dark ? 'frame' : 'frame on-light';
  if (square) {
    return `<div class="${cls}" style="${style};flex-direction:row;gap:48px;align-items:center">
<div style="flex:1;min-width:0;display:flex;flex-direction:column;height:100%">${text}${ctaRow()}</div><div class="slot" style="flex:0 0 44%;height:100%">${frame}</div></div>`;
  }
  return `<div class="${cls}" style="${style}">${text}<div class="slot" style="flex:1;margin-top:36px;min-height:0">${frame}</div>${ctaRow()}</div>`;
}

function renderPhoto(c, format) {
  const photo = asset(c.background, 'background', c.id);
  const square = format.height === format.width;
  return `<img src="${photo}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${c.focus ?? 'center'}">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,18,14,.55) 0%,rgba(6,18,14,0) 28%,rgba(6,18,14,0) 42%,rgba(6,18,14,.88) 78%)"></div>
<div class="frame" style="color:#fff">${logoLine(true)}
<div style="margin-top:auto">${c.eyebrow ? `<div class="eyebrow">${esc(c.eyebrow)}</div>` : ''}<h1 style="font-size:${square ? 78 : 96}px;text-shadow:0 4px 30px rgba(0,0,0,.35)">${markup(c.headline)}</h1>${c.body ? `<p class="body" style="opacity:.92">${markup(c.body)}</p>` : ''}</div>
${ctaRow()}</div>`;
}

function renderPost(c, format) {
  const square = format.height === format.width;
  const paragraphs = (c.paragraphs ?? [c.body]).filter(Boolean);
  return `<div class="frame" style="background:${c.theme === 'dark' ? '#111614' : '#fff'};color:${c.theme === 'dark' ? '#f2f5f3' : '#111'}">
<div style="display:flex;align-items:center;gap:20px">${brand.logoSquare ? `<img src="${brand.logoSquare}" style="width:84px;height:84px;border-radius:50%">` : ''}<div><div style="font-weight:700;font-size:32px">${esc(brand.name)}</div><div style="font-size:26px;opacity:.55">${esc(c.byline ?? 'A note for the people who do this every week')}</div></div></div>
<h1 style="font-family:var(--text);font-weight:800;font-size:${square ? 58 : 76}px;line-height:1.12;margin-top:48px">${markup(c.headline)}</h1>
${paragraphs.map((text) => `<p style="font-size:${square ? 32 : 42}px;line-height:1.42;margin-top:30px;opacity:.86">${markup(text)}</p>`).join('')}
<div style="margin-top:auto;padding-top:28px;font-size:32px;font-weight:700;color:${c.theme === 'dark' ? 'var(--accent)' : 'var(--primary)'}">${esc(c.cta ?? defaults.cta ?? '')} →</div></div>`;
}

function renderThread(c, format) {
  const messages = c.messages ?? [];
  const square = format.height === format.width;
  const size = square ? 32 : 38;
  return `<div class="frame" style="background:#fff;padding-left:56px;padding-right:56px">
${c.headline ? `<h1 style="font-size:${square ? 54 : 66}px;color:var(--ink);margin-bottom:30px">${markup(c.headline)}</h1>` : ''}
<div style="text-align:center;font-size:24px;color:#8a8f8d;margin-bottom:22px">${esc(c.threadLabel ?? 'Sale day')}</div>
<div style="display:flex;flex-direction:column;gap:16px">
${messages.map((message) => {
    const mine = message.from === 'me';
    if (message.image) {
      return `<div style="align-self:${mine ? 'flex-end' : 'flex-start'};width:${square ? 360 : 460}px;height:${square ? 280 : 400}px;border-radius:28px;overflow:hidden"><img src="${asset(message.image, 'message image', c.id)}" style="width:100%;height:100%;object-fit:cover;object-position:${message.crop ?? 'top center'}"></div>`;
    }
    return `<div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:78%;background:${mine ? '#0a84ff' : '#e9e9eb'};color:${mine ? '#fff' : '#111'};font-size:${size}px;line-height:1.3;padding:20px 28px;border-radius:36px;${mine ? 'border-bottom-right-radius:10px' : 'border-bottom-left-radius:10px'}">${markup(message.text ?? '')}</div>`;
  }).join('\n')}
</div>${ctaRow(false, true)}</div>`;
}

function renderNotes(c, format) {
  const square = format.height === format.width;
  const items = c.items ?? [];
  return `<div class="frame" style="background:#fffbea;background-image:repeating-linear-gradient(180deg,transparent 0 ${square ? 63 : 75}px,#efe6c4 ${square ? 63 : 75}px ${square ? 65 : 77}px);color:#2b2a26">
<div style="font-size:26px;color:#c39b00;font-weight:600;margin-bottom:18px">${esc(c.notesLabel ?? 'Notes')}</div>
<h1 style="font-family:var(--text);font-weight:800;font-size:${square ? 60 : 74}px;line-height:1.08">${markup(c.headline)}</h1>
<div style="margin-top:34px;display:flex;flex-direction:column;gap:${square ? 14 : 22}px">
${items.map((item) => {
    const done = typeof item === 'object' && item.done;
    const text = typeof item === 'object' ? item.text : item;
    return `<div style="display:flex;gap:22px;align-items:flex-start;font-size:${square ? 34 : 42}px;line-height:1.3"><span style="flex:none;width:${square ? 40 : 48}px;height:${square ? 40 : 48}px;border-radius:50%;border:3px solid ${done ? '#e0a800' : '#b9b3a0'};background:${done ? '#e0a800' : 'transparent'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${square ? 26 : 32}px;margin-top:4px">${done ? '✓' : ''}</span><span style="${done ? '' : ''}">${markup(text)}</span></div>`;
  }).join('\n')}
</div>${ctaRow(false, true)}</div>`;
}

function renderScreenshot(c, format) {
  const shot = asset(c.screenshot, 'screenshot', c.id);
  return `<div style="position:absolute;inset:0;background:#fff;padding-top:var(--safe-top);padding-bottom:var(--safe-bottom)">
<div style="background:#fff;padding:36px 56px 30px;border-bottom:2px solid #eee"><h1 style="font-family:var(--text);font-size:${format.height === format.width ? 52 : 62}px;line-height:1.12;color:#111">${markup(c.headline)}</h1></div>
<img src="${shot}" style="width:100%;height:calc(100% - ${c.captionHeight ?? 250}px);object-fit:cover;object-position:${c.crop ?? 'top center'};display:block"></div>`;
}

function renderCompare(c, format) {
  const square = format.height === format.width;
  const left = c.left ?? { title: 'Before', items: [] };
  const right = c.right ?? { title: brand.name, items: [] };
  const column = (side, good) => `<div style="flex:1;border-radius:32px;padding:${square ? 30 : 40}px;background:${good ? 'var(--deep)' : '#eef0ef'};color:${good ? '#fff' : '#3b4240'}">
<div style="font-weight:800;font-size:${square ? 34 : 40}px;margin-bottom:${square ? 18 : 28}px">${esc(side.title)}</div>
${side.items.map((item) => `<div style="display:flex;gap:16px;font-size:${square ? 28 : 34}px;line-height:1.3;margin-top:${square ? 12 : 20}px"><span style="flex:none;font-weight:800;color:${good ? 'var(--accent)' : '#c0392b'}">${good ? '✓' : '✕'}</span><span>${markup(item)}</span></div>`).join('')}</div>`;
  return `<div class="frame" style="background:#fff">
${logoLine(false)}<h1 style="font-size:${square ? 64 : 84}px;margin:30px 0 ${square ? 30 : 44}px;color:var(--ink)">${markup(c.headline)}</h1>
<div style="display:flex;gap:24px;${square ? '' : 'flex-direction:column'}">${column(left, false)}${column(right, true)}</div>${ctaRow(false)}</div>`;
}

function renderStatement(c, format) {
  const square = format.height === format.width;
  const dark = c.theme !== 'light';
  return `<div class="frame${dark ? '' : ' on-light'}" style="background:${dark ? 'var(--deep)' : 'var(--accent)'};color:${dark ? '#fff' : 'var(--deep)'};justify-content:center">
${c.eyebrow ? `<div class="eyebrow">${esc(c.eyebrow)}</div>` : ''}
<h1 style="font-size:${c.size ?? (square ? 104 : 124)}px;line-height:.98">${markup(c.headline)}</h1>
${c.body ? `<p class="body" style="font-size:${square ? 34 : 40}px">${markup(c.body)}</p>` : ''}
<div style="display:flex;align-items:center;justify-content:space-between;margin-top:${square ? 60 : 90}px">${logoLine(dark)}${c.showCta === false ? '' : `<span style="font-weight:800;font-size:34px">${esc(c.cta ?? defaults.cta ?? '')} →</span>`}</div></div>`;
}

function logoLine(dark) {
  const logo = dark ? brand.logoDark ?? brand.logo : brand.logo;
  if (logo) {
    return `<img class="logo" src="${logo}" alt="${esc(brand.name)}">`;
  }
  return `<div class="brandline">${esc(brand.name)}</div>`;
}

function ctaRow(withBadge = true, compact = false) {
  const cta = defaults.cta ? `<span class="cta" style="${compact ? 'font-size:30px;padding:18px 34px' : ''}">${esc(defaults.cta)}</span>` : '';
  const badge = withBadge && brand.badge ? `<img class="badge" src="${brand.badge}">` : '';
  const logo = compact ? `<span style="margin-left:auto">${logoLine(false)}</span>` : '';
  return `<div class="cta-row">${cta}${badge}${logo}</div>`;
}

function normaliseBrand(input) {
  if (!input.name) {
    fail('job.brand.name is required');
  }
  const colors = {
    primary: '#334155',
    deep: '#0f172a',
    accent: '#fbbf24',
    light: '#f1f5f9',
    ink: '#111827',
    muted: '#64748b',
    paper: '#ffffff',
    ...(input.colors ?? {})
  };
  const fileUrl = (value, label) => {
    if (!value) return null;
    const resolved = path.resolve(jobDir, value);
    assertReadableRegularFile(resolved, label);
    return pathToFileURL(resolved).href;
  };
  const fonts = (input.fonts ?? []).map((font, index) => {
    if (!font.family || !font.file) {
      fail(`job.brand.fonts[${index}] needs family and file`);
    }
    const file = path.resolve(jobDir, font.file);
    assertReadableRegularFile(file, `job.brand.fonts[${index}].file`);
    return { ...font, file };
  });
  return {
    name: input.name,
    colors,
    fonts,
    logo: fileUrl(input.logo, 'job.brand.logo'),
    logoDark: fileUrl(input.logoDark, 'job.brand.logoDark'),
    logoSquare: fileUrl(input.logoSquare, 'job.brand.logoSquare'),
    badge: fileUrl(input.badge, 'job.brand.badge')
  };
}

function resolveAssets(input) {
  const resolved = {};
  for (const [key, value] of Object.entries(input)) {
    const file = path.resolve(jobDir, value);
    assertReadableRegularFile(file, `job.assets.${key}`);
    resolved[key] = pathToFileURL(file).href;
  }
  return resolved;
}

function asset(key, label, id) {
  if (!key) {
    fail(`creative ${id} needs a ${label}`);
  }
  if (!assets[key]) {
    fail(`creative ${id} references unknown asset: ${key}`);
  }
  return assets[key];
}

function validateCreatives(list) {
  if (!Array.isArray(list) || list.length === 0) {
    fail('job.creatives must be a non-empty array');
  }
  const seen = new Set();
  const defaultFormats = defaults.formats ?? ['4:5', '9:16', '1:1'];
  return list.map((creative, index) => {
    if (!creative.id || !/^[a-z0-9][a-z0-9-]*$/.test(creative.id)) {
      fail(`job.creatives[${index}].id must be lowercase letters, numbers, and dashes`);
    }
    if (seen.has(creative.id)) {
      fail(`duplicate creative id: ${creative.id}`);
    }
    seen.add(creative.id);
    if (!templates[creative.template]) {
      fail(`creative ${creative.id} uses unknown template: ${creative.template} (expected ${Object.keys(templates).join(', ')})`);
    }
    const creativeFormats = creative.formats ?? defaultFormats;
    for (const formatKey of creativeFormats) {
      if (!formats[formatKey]) {
        fail(`creative ${creative.id} uses unknown format: ${formatKey} (expected ${Object.keys(formats).join(', ')})`);
      }
    }
    return { ...creative, formats: creativeFormats, adSet: creative.adSet ?? 'default' };
  });
}

function landingUrl(creative) {
  const base = creative.url ?? defaults.url;
  if (!base) return null;
  const url = new URL(base);
  const utm = { ...(defaults.utm ?? {}), ...(creative.utm ?? {}) };
  for (const [key, value] of Object.entries(utm)) {
    url.searchParams.set(`utm_${key}`, value);
  }
  if (Object.keys(utm).length > 0) {
    url.searchParams.set('utm_content', creative.id);
  }
  return url.href;
}

function screenshot(chromePath, { format, htmlFile, pngFile }) {
  return new Promise((resolve, reject) => {
    const child = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      '--force-device-scale-factor=1', '--allow-file-access-from-files', '--virtual-time-budget=4000',
      `--window-size=${format.width},${format.height}`, `--screenshot=${pngFile}`, pathToFileURL(htmlFile).href
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && existsSync(pngFile)) resolve();
      else reject(new Error(`Chrome failed for ${path.basename(htmlFile)} (exit ${code}): ${stderr.trim().split('\n').pop()}`));
    });
  });
}

async function runPool(items, size, worker) {
  let next = 0;
  const failures = [];
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (error) {
        failures.push(error.message);
      }
    }
  }));
  if (failures.length > 0) {
    fail(failures.join('\n'));
  }
}

function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ...playwrightChromes(),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  if (explicit && !existsSync(explicit)) {
    fail(`--chrome does not exist: ${explicit}`);
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function playwrightChromes() {
  const roots = [path.join(homedir(), 'Library/Caches/ms-playwright'), path.join(homedir(), '.cache/ms-playwright')];
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse();
    for (const dir of dirs) {
      found.push(
        path.join(root, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        path.join(root, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
        path.join(root, dir, 'chrome-linux/chrome')
      );
    }
  }
  return found;
}

function contactSheet(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.adSet)) groups.set(row.adSet, []);
    groups.get(row.adSet).push(row);
  }
  const cards = (list) => list.map((row) => `<figure><a href="${row.image ?? row.html}"><img src="${row.image ?? ''}" alt="${esc(row.adName)}"></a><figcaption><b>${esc(row.id)}</b> · ${esc(row.format)} · ${esc(row.style)}<br>${esc(row.headline)}</figcaption></figure>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(brand.name)} creatives</title>
<style>body{font-family:-apple-system,Arial,sans-serif;margin:32px;background:#f4f5f4;color:#111}h2{margin:40px 0 12px}section{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}figure{margin:0;background:#fff;border-radius:10px;padding:10px}img{width:100%;border-radius:6px;display:block}figcaption{font-size:12px;margin-top:8px;line-height:1.4}</style></head><body>
<h1>${esc(brand.name)}: ${rows.length} files</h1>
${[...groups].map(([adSet, list]) => `<h2>${esc(adSet)} (${list.length})</h2><section>${cards(list)}</section>`).join('\n')}
</body></html>
`;
}

function toCsv(rows) {
  const columns = ['adSet', 'adName', 'format', 'style', 'image', 'primaryText', 'headline', 'description', 'cta', 'url'];
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => cell(row[column])).join(',')).join('\n')}\n`;
}

function markup(value) {
  return esc(value ?? '').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
}

function stripMarkup(value) {
  return String(value).replace(/\*/g, '').replace(/\n/g, ' ');
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseConcurrency(value) {
  if (value === undefined) return 4;
  if (!/^[1-9]\d*$/.test(value)) {
    fail('--concurrency must be a positive whole number');
  }
  return Number(value);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      fail(`unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (!supportedOptions.has(key)) {
      fail(`unrecognized option: ${token}`);
    }
    if (Object.hasOwn(parsed, key)) {
      fail(`duplicate option: ${token}`);
    }
    if (booleanOptions.has(key)) {
      parsed[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`missing value for ${token}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function assertReadableRegularFile(file, label) {
  try {
    if (!statSync(file).isFile()) {
      fail(`${label} must be a regular file: ${file}`);
    }
    accessSync(file, constants.R_OK);
  } catch (error) {
    if (error?.code) {
      fail(`${label} must be an existing readable file: ${file}`);
    }
    throw error;
  }
}

function fail(message) {
  process.stderr.write(`ERROR: ${message}\nRun with --help for usage.\n`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  npm run creative:render -- --job path/to/render-job.json [--out-dir output/creatives]

Renders finished Meta ad images from a JSON job: brand profile, local assets,
and a list of creatives. Each creative picks one of these visual styles:

  device      brand background, headline, screenshot in a phone or card frame
  photo       full-bleed lifestyle photo with headline and CTA
  post        plain native text post
  thread      message-thread conversation
  notes       notes-app checklist
  screenshot  raw product screenshot with a caption bar
  compare     before/after comparison columns
  statement   one big line on a solid colour

Formats: 1:1 (1080x1080), 4:5 (1080x1350), 9:16 (1080x1920, with Stories
and Reels safe zones).

Options:
  --job <path>          Render job JSON (required). Asset paths are relative to it.
  --out-dir <path>      Output directory (default: <job dir>/output).
  --only <id>           Render a single creative id.
  --chrome <path>       Chrome or Chromium binary (default: CHROME_PATH, then
                        common install paths and the Playwright cache).
  --concurrency <n>     Parallel Chrome processes (default: 4).
  --html-only           Write HTML, manifest, and copy CSV without screenshots.

Outputs:
  <format>/<id>.png, html/, manifest.json, meta-copy.csv (one row per file,
  grouped by adSet for Ads Manager bulk upload), contact-sheet.html.

This command never calls Meta or an image model. See
examples/render-job.example.json for the job shape.`);
}

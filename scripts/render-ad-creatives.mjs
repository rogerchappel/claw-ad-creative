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
  statement: renderStatement,
  scorecard: renderScorecard,
  poll: renderPoll,
  search: renderSearch,
  ticket: renderTicket,
  calendar: renderCalendar,
  status: renderStatus,
  caption: renderCaption,
  sticky: renderSticky
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
const creatives = validateCreatives([...(job.creatives ?? []), ...expandMatrix(job.matrix), ...expandCarousels(job.carousels)]);
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
  primaryTextLong: creative.primaryTextLong ?? '',
  headline: creative.metaHeadline ?? stripMarkup(creative.headline ?? ''),
  description: creative.description ?? defaults.description ?? '',
  cta: creative.metaCta ?? defaults.metaCta ?? 'LEARN_MORE',
  url: landingUrl(creative),
  hypothesis: creative.hypothesis ?? null,
  test: creative.test ?? null,
  carousel: creative.carousel ?? null,
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
em{font-style:normal}
h1 em{color:var(--accent)}
.eyebrow{font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:26px;opacity:.75;margin-bottom:22px}
.body{font-size:34px;line-height:1.35;margin-top:24px;opacity:.85}
.logo{height:56px;width:auto;max-width:min(520px,100%);object-fit:contain;object-position:left center;display:block;align-self:flex-start}
.on-light em,.on-light h1 em{color:var(--primary)}
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
<div style="flex:1;min-width:0;display:flex;flex-direction:column;height:100%">${text}${ctaRow(true, false, true, c.cta ?? defaults.cta)}</div><div class="slot" style="flex:0 0 44%;height:100%">${frame}</div></div>`;
  }
  return `<div class="${cls}" style="${style}">${text}<div class="slot" style="flex:1;margin-top:36px;min-height:0">${frame}</div>${ctaRow(true, false, true, c.cta ?? defaults.cta)}</div>`;
}

function renderPhoto(c, format) {
  const photo = asset(c.background, 'background', c.id);
  const square = format.height === format.width;
  return `<img src="${photo}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${c.focus ?? 'center'}">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,18,14,.6) 0%,rgba(6,18,14,0) 22%,rgba(6,18,14,0) 34%,rgba(6,18,14,.82) 58%,rgba(6,18,14,.95) 100%)"></div>
<div class="frame" style="color:#fff">${logoLine(true)}
<div style="margin-top:auto">${c.eyebrow ? `<div class="eyebrow">${esc(c.eyebrow)}</div>` : ''}<h1 style="font-size:${square ? 78 : 96}px;text-shadow:0 4px 30px rgba(0,0,0,.35)">${markup(c.headline)}</h1>${c.body ? `<p class="body" style="opacity:.92">${markup(c.body)}</p>` : ''}</div>
${ctaRow(true, false, true, c.cta ?? defaults.cta)}</div>`;
}

function renderPost(c, format) {
  const paragraphs = (c.paragraphs ?? [c.body]).filter(Boolean);
  const dark = c.theme === 'dark';
  return `<div class="frame" style="background:${dark ? '#111614' : '#fff'};color:${dark ? '#f2f5f3' : '#111'}">
<div style="display:flex;align-items:center;gap:20px">${brand.logoSquare ? `<img src="${brand.logoSquare}" style="width:${pick(format, 84, 96, 104)}px;height:${pick(format, 84, 96, 104)}px;border-radius:50%">` : ''}<div><div style="font-weight:700;font-size:${pick(format, 32, 36, 40)}px">${esc(brand.name)}</div><div style="font-size:${pick(format, 26, 28, 30)}px;opacity:.55">${esc(c.byline ?? 'A note for the people who do this every week')}</div></div></div>
<div style="margin:auto 0">
<h1 style="font-family:var(--text);font-weight:800;font-size:${pick(format, 64, 86, 96)}px;line-height:1.1">${markup(c.headline)}</h1>
${paragraphs.map((text) => `<p style="font-size:${pick(format, 36, 46, 52)}px;line-height:1.4;margin-top:${pick(format, 26, 36, 44)}px;opacity:.86">${markup(text)}</p>`).join('')}
</div>${footer(c, 'logo', !dark)}</div>`;
}

function renderThread(c, format) {
  const messages = c.messages ?? [];
  const size = pick(format, 34, 44, 50);
  return `<div class="frame on-light" style="background:#fff;padding-left:56px;padding-right:56px">
${c.headline ? `<h1 style="font-size:${pick(format, 56, 72, 84)}px;color:var(--ink);margin-bottom:30px">${markup(c.headline)}</h1>` : ''}
<div style="margin:auto 0"><div style="text-align:center;font-size:${pick(format, 24, 28, 32)}px;color:#8a8f8d;margin-bottom:22px">${esc(c.threadLabel ?? 'Sale day')}</div>
<div style="display:flex;flex-direction:column;gap:${pick(format, 14, 18, 22)}px">
${messages.map((message) => {
    const mine = message.from === 'me';
    if (message.image) {
      return `<div style="align-self:${mine ? 'flex-end' : 'flex-start'};width:${pick(format, 400, 560, 640)}px;height:${pick(format, 300, 420, 560)}px;border-radius:28px;overflow:hidden;border:2px solid #e5e5ea"><img src="${asset(message.image, 'message image', c.id)}" style="width:100%;height:100%;object-fit:cover;object-position:${message.crop ?? 'top center'}"></div>`;
    }
    return `<div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:78%;background:${mine ? '#0a84ff' : '#e9e9eb'};color:${mine ? '#fff' : '#111'};font-size:${size}px;line-height:1.3;padding:${pick(format, 20, 24, 28)}px ${pick(format, 28, 34, 38)}px;border-radius:40px;${mine ? 'border-bottom-right-radius:10px' : 'border-bottom-left-radius:10px'}">${markup(message.text ?? '')}</div>`;
  }).join('\n')}
</div></div>${footer(c, 'logo', true)}</div>`;
}

function renderNotes(c, format) {
  const items = c.items ?? [];
  const line = pick(format, 64, 80, 92);
  const box = pick(format, 44, 58, 66);
  return `<div class="frame on-light" style="background:#fffbea;background-image:repeating-linear-gradient(180deg,transparent 0 ${line - 2}px,#efe6c4 ${line - 2}px ${line}px);color:#2b2a26">
<div style="margin:auto 0"><div style="font-size:${pick(format, 28, 34, 38)}px;color:#c39b00;font-weight:600;margin-bottom:18px">${esc(c.notesLabel ?? 'Notes')}</div>
<h1 style="font-family:var(--text);font-weight:800;font-size:${pick(format, 68, 92, 104)}px;line-height:1.05">${markup(c.headline)}</h1>
<div style="padding-top:${pick(format, 30, 48, 56)}px;display:flex;flex-direction:column;gap:${pick(format, 18, 30, 40)}px">
${items.map((item) => {
    const done = typeof item === 'object' && item.done;
    const text = typeof item === 'object' ? item.text : item;
    return `<div style="display:flex;gap:26px;align-items:flex-start;font-size:${pick(format, 40, 54, 60)}px;line-height:1.25"><span style="flex:none;width:${box}px;height:${box}px;border-radius:50%;border:4px solid ${done ? '#e0a800' : '#b9b3a0'};background:${done ? '#e0a800' : 'transparent'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(box * 0.62)}px;margin-top:4px">${done ? '✓' : ''}</span><span>${markup(text)}</span></div>`;
  }).join('\n')}
</div></div>${footer(c, 'logo', true)}</div>`;
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
  const column = (side, good) => `<div style="flex:1;border-radius:32px;padding:${pick(format, 30, 40, 48)}px;background:${good ? 'var(--deep)' : '#eef0ef'};color:${good ? '#fff' : '#3b4240'}">
<div style="font-weight:800;font-size:${pick(format, 34, 42, 48)}px;margin-bottom:${square ? 18 : 28}px">${esc(side.title)}</div>
${side.items.map((item) => `<div style="display:flex;gap:16px;font-size:${pick(format, 28, 36, 42)}px;line-height:1.3;margin-top:${square ? 12 : 20}px"><span style="flex:none;font-weight:800;color:${good ? 'var(--accent)' : '#c0392b'}">${good ? '✓' : '✕'}</span><span>${markup(item)}</span></div>`).join('')}</div>`;
  return `<div class="frame on-light" style="background:#fff">
${logoLine(false)}<h1 style="font-size:${pick(format, 64, 84, 96)}px;margin:30px 0 ${square ? 30 : 44}px;color:var(--ink)">${markup(c.headline)}</h1>
<div style="display:flex;gap:24px;${square ? '' : 'flex-direction:column;margin:auto 0'}">${column(left, false)}${column(right, true)}</div>${footer(c, 'full', true)}</div>`;
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

function renderScorecard(c, format) {
  const dark = c.theme === 'dark';
  const lots = c.lots ?? [];
  // A long headline takes a row's space, which keeps the CTA inside the frame.
  const rowCount = Math.max(3, pick(format, 3, 4, 5) - (stripMarkup(c.headline ?? '').length > 54 ? 1 : 0));
  const tone = (score) => (score >= 8 ? 'var(--primary)' : score >= 5 ? '#d99a00' : '#9aa19e');
  const row = (lot, index) => `<div style="display:flex;align-items:center;gap:${pick(format, 20, 26, 30)}px;background:#fff;color:#111;border-radius:${pick(format, 22, 28, 32)}px;padding:${pick(format, 18, 26, 30)}px ${pick(format, 24, 30, 34)}px;box-shadow:0 10px 30px rgba(0,0,0,.12)${index === 0 && c.highlightFirst !== false ? ';outline:5px solid var(--accent)' : ''}">
<div style="flex:none;font-weight:800;font-size:${pick(format, 26, 30, 34)}px;color:#6b7370;width:${pick(format, 110, 130, 150)}px">${esc(lot.lot ? `Lot ${lot.lot}` : '')}</div>
<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:${pick(format, 32, 40, 46)}px;line-height:1.15">${markup(lot.label ?? '')}${lot.star ? ' <span style="color:#e0a800">★</span>' : ''}</div>
${lot.tags?.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">${lot.tags.map((tag) => `<span style="font-size:${pick(format, 20, 24, 27)}px;font-weight:700;color:var(--primary);background:var(--light);border-radius:999px;padding:6px 14px">✓ ${esc(tag)}</span>`).join('')}</div>` : ''}</div>
${lot.score !== undefined ? `<div style="flex:none;min-width:${pick(format, 96, 116, 128)}px;text-align:center;font-weight:800;font-size:${pick(format, 40, 50, 56)}px;color:#fff;background:${tone(Number(lot.score))};border-radius:${pick(format, 18, 22, 24)}px;padding:${pick(format, 10, 14, 16)}px 0">${esc(Number(lot.score).toFixed(1))}</div>` : ''}</div>`;
  return `<div class="frame${dark ? '' : ' on-light'}" style="background:${dark ? 'radial-gradient(120% 80% at 80% 100%, var(--primary) 0%, var(--deep) 60%)' : 'var(--light)'};color:${dark ? '#fff' : 'var(--ink)'}">
${logoLine(dark)}${c.eyebrow ? `<div class="eyebrow" style="margin-top:32px">${esc(c.eyebrow)}</div>` : ''}<h1 style="font-size:${pick(format, 66, 86, 96)}px;${c.eyebrow ? '' : 'margin-top:32px'}">${markup(c.headline)}</h1>
<div style="margin:auto 0;padding-top:${pick(format, 24, 36, 44)}px">${c.listLabel ? `<div style="font-weight:700;font-size:${pick(format, 24, 28, 32)}px;opacity:.7;margin-bottom:16px">${esc(c.listLabel)}</div>` : ''}<div style="display:flex;flex-direction:column;gap:${pick(format, 12, 18, 22)}px">${lots.slice(0, rowCount).map(row).join('')}</div></div>
${footer(c, 'full', !dark, false, true)}</div>`;
}

function renderPoll(c, format) {
  const photo = c.background ? asset(c.background, 'background', c.id) : null;
  const options = c.options ?? ['Yes', 'No'];
  return `${photo ? `<img src="${photo}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${c.focus ?? 'center'}"><div style="position:absolute;inset:0;background:rgba(6,18,14,.45)"></div>` : ''}
<div class="frame" style="${photo ? '' : 'background:linear-gradient(160deg,var(--primary),var(--deep))'};color:#fff;align-items:center;text-align:center">
${c.headline ? `<h1 style="font-size:${pick(format, 60, 78, 88)}px;text-shadow:0 4px 30px rgba(0,0,0,.35)">${markup(c.headline)}</h1>` : ''}
<div style="margin:auto 0;width:${pick(format, 760, 860, 900)}px;background:#fff;color:#111;border-radius:40px;padding:${pick(format, 34, 44, 52)}px;box-shadow:0 30px 80px rgba(0,0,0,.35)">
<div style="font-family:var(--display);font-weight:800;font-size:${pick(format, 44, 54, 60)}px;line-height:1.12;margin-bottom:${pick(format, 26, 34, 40)}px">${markup(c.question ?? '')}</div>
${options.map((option) => `<div style="border:3px solid #e3e6e5;border-radius:999px;padding:${pick(format, 20, 26, 30)}px;font-weight:800;font-size:${pick(format, 34, 42, 46)}px;margin-top:${pick(format, 14, 18, 22)}px;color:var(--deep)">${markup(option)}</div>`).join('')}
</div>
${c.body ? `<p class="body" style="font-weight:700;margin:0 0 ${pick(format, 20, 30, 36)}px;text-shadow:0 2px 20px rgba(0,0,0,.35)">${markup(c.body)}</p>` : ''}
<div style="align-self:stretch">${footer(c, 'logo', false)}</div></div>`;
}

function renderSearch(c, format) {
  const suggestions = c.suggestions ?? [];
  const icon = `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>`;
  return `<div class="frame on-light" style="background:#fff">
${c.headline ? `<h1 style="font-size:${pick(format, 62, 80, 92)}px;color:var(--ink)">${markup(c.headline)}</h1>` : ''}
<div style="margin:auto 0">
<div style="display:flex;align-items:center;gap:22px;border-radius:999px;box-shadow:0 6px 28px rgba(0,0,0,.14);border:2px solid #e6e8e7;padding:${pick(format, 24, 30, 34)}px ${pick(format, 34, 40, 44)}px;font-size:${pick(format, 36, 44, 50)}px;color:#202124"><span style="color:#8a8f8d;display:flex">${icon}</span><span>${esc(c.query ?? '')}<span style="display:inline-block;width:4px;height:1.1em;background:#1a73e8;vertical-align:-0.15em;margin-left:4px"></span></span></div>
<div style="margin-top:14px;border-radius:32px;border:2px solid #eceeed;padding:${pick(format, 10, 16, 20)}px 0">
${suggestions.map((text) => `<div style="display:flex;align-items:center;gap:22px;padding:${pick(format, 14, 20, 24)}px ${pick(format, 34, 40, 44)}px;font-size:${pick(format, 32, 40, 46)}px;color:#3c4043"><span style="color:#9aa0a6;display:flex">${icon}</span><span>${markup(text)}</span></div>`).join('')}
</div>
${c.body ? `<p style="font-family:var(--display);font-weight:800;font-size:${pick(format, 46, 60, 68)}px;line-height:1.1;margin-top:${pick(format, 34, 50, 60)}px;color:var(--ink)">${markup(c.body)}</p>` : ''}
</div>${footer(c, 'full', true)}</div>`;
}

function renderTicket(c, format) {
  const fields = c.fields ?? [];
  const code = (value, city) => `<div><div style="font-family:var(--display);font-weight:800;font-size:${pick(format, 104, 128, 140)}px;line-height:1;color:var(--deep)">${esc(value)}</div><div style="font-size:${pick(format, 26, 30, 34)}px;color:#6b7370;margin-top:8px">${esc(city ?? '')}</div></div>`;
  return `<div class="frame" style="background:radial-gradient(120% 80% at 20% 0%, var(--primary) 0%, var(--deep) 65%);color:#fff">
${c.headline ? `<h1 style="font-size:${pick(format, 66, 86, 96)}px">${markup(c.headline)}</h1>` : ''}
<div style="margin:auto 0;background:#fff;color:#111;border-radius:36px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4)">
<div style="background:var(--accent);color:var(--deep);font-weight:800;font-size:${pick(format, 24, 28, 30)}px;letter-spacing:.16em;text-transform:uppercase;padding:18px 40px">${esc(c.passLabel ?? 'Boarding pass')}</div>
<div style="padding:${pick(format, 30, 40, 46)}px 40px;display:flex;align-items:center;justify-content:space-between">${code(c.from ?? '', c.fromCity)}<div style="font-size:${pick(format, 52, 64, 70)}px;color:var(--primary)">✈</div><div style="text-align:right">${code(c.to ?? '', c.toCity).replace('<div>', '<div style="text-align:right">')}</div></div>
<div style="display:grid;grid-template-columns:repeat(${Math.min(fields.length || 1, 3)},1fr);gap:20px;padding:0 40px ${pick(format, 30, 36, 40)}px">${fields.map((field) => `<div><div style="font-size:${pick(format, 20, 24, 26)}px;text-transform:uppercase;letter-spacing:.1em;color:#8a8f8d">${esc(field.label)}</div><div style="font-weight:800;font-size:${pick(format, 32, 38, 42)}px;margin-top:6px">${markup(field.value)}</div></div>`).join('')}</div>
${c.stub ? `<div style="border-top:4px dashed #dfe3e1;padding:${pick(format, 24, 30, 34)}px 40px;font-weight:800;font-size:${pick(format, 30, 36, 38)}px;color:var(--primary)">${markup(c.stub)}</div>` : ''}
</div>
${c.body ? `<p class="body" style="margin:0 0 10px">${markup(c.body)}</p>` : ''}${footer(c, 'full', false)}</div>`;
}

function renderCalendar(c, format) {
  const items = c.items ?? [];
  return `<div class="frame on-light" style="background:var(--light);color:var(--ink)">
${c.headline ? `<h1 style="font-size:${pick(format, 64, 84, 94)}px">${markup(c.headline)}</h1>` : ''}
<div style="margin:auto 0;display:flex;${format.width === format.height ? 'gap:40px;align-items:center' : 'flex-direction:column;gap:40px;align-items:center'}">
<div style="flex:none;width:${pick(format, 400, 440, 480)}px;background:#fff;border-radius:44px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.18);text-align:center">
<div style="background:#e5484d;color:#fff;font-weight:800;font-size:${pick(format, 40, 50, 56)}px;letter-spacing:.12em;padding:${pick(format, 18, 24, 26)}px 0">${esc(c.month ?? '')}</div>
<div style="font-family:var(--display);font-weight:800;font-size:${pick(format, 210, 220, 240)}px;line-height:1.05;color:#111">${esc(c.day ?? '')}</div>
<div style="font-size:${pick(format, 32, 40, 44)}px;color:#6b7370;padding-bottom:${pick(format, 24, 30, 34)}px">${esc(c.weekday ?? '')}</div></div>
${items.length ? `<div style="flex:1;display:flex;flex-direction:column;gap:${pick(format, 14, 18, 22)}px;align-self:stretch;justify-content:center">${items.map((item) => `<div style="background:#fff;border-left:10px solid ${item.done ? 'var(--primary)' : '#e5484d'};border-radius:20px;padding:${pick(format, 16, 22, 26)}px ${pick(format, 22, 28, 32)}px;font-size:${pick(format, 30, 38, 42)}px;font-weight:700">${item.time ? `<span style="color:#8a8f8d;font-weight:600;margin-right:14px">${esc(item.time)}</span>` : ''}${markup(item.text)}</div>`).join('')}</div>` : ''}
</div>${footer(c, 'full', true)}</div>`;
}

function renderStatus(c, format) {
  const statusBackgrounds = {
    brand: 'linear-gradient(135deg,var(--primary),var(--deep))',
    sunset: 'linear-gradient(135deg,#f6a35b,#e8536a)',
    ocean: 'linear-gradient(135deg,#3aa0e8,#2742b8)',
    violet: 'linear-gradient(135deg,#a259e6,#5b2bb8)',
    red: '#d93a3a',
    black: '#141414'
  };
  const text = stripMarkup(c.headline ?? '');
  // Coloured status posts shrink the type as the text gets longer, so short lines hit hard and long ones still fit.
  const scale = text.length <= 40 ? 1 : text.length <= 90 ? 0.88 : 0.7;
  const background = statusBackgrounds[c.color] ?? c.color ?? statusBackgrounds.brand;
  return `<div class="frame" style="background:${background};color:#fff;justify-content:center;text-align:center;${c.color && c.color !== 'brand' ? '--accent:#fff;' : ''}">
<h1 style="font-family:var(--text);font-weight:800;letter-spacing:-0.01em;line-height:1.18;font-size:${Math.round(pick(format, 92, 104, 112) * scale)}px">${markup(c.headline)}</h1>
${footer(c, 'none', false)}</div>`;
}

function renderCaption(c, format) {
  const photo = asset(c.background, 'background', c.id);
  const byline = c.byline === false ? '' : `<div style="display:flex;align-items:center;gap:18px;margin-bottom:22px">${brand.logoSquare ? `<img src="${brand.logoSquare}" style="width:${pick(format, 64, 72, 80)}px;height:${pick(format, 64, 72, 80)}px;border-radius:50%">` : ''}<div style="font-weight:700;font-size:${pick(format, 28, 32, 36)}px">${esc(c.byline ?? brand.name)}</div></div>`;
  return `<div style="position:absolute;inset:0;background:#fff;color:#111;padding-top:var(--safe-top);display:flex;flex-direction:column">
<div style="padding:${pick(format, 36, 44, 52)}px 56px ${pick(format, 30, 36, 44)}px">${byline}<p style="font-size:${pick(format, 48, 58, 64)}px;line-height:1.22;font-weight:600">${markup(c.headline)}</p></div>
<img src="${photo}" style="flex:1;min-height:0;width:100%;object-fit:cover;object-position:${c.focus ?? 'center'};display:block"></div>`;
}

function renderSticky(c, format) {
  const photo = c.background ? asset(c.background, 'background', c.id) : null;
  const items = c.items ?? [];
  return `${photo ? `<img src="${photo}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${c.focus ?? 'center'}">` : ''}
<div class="frame" style="${photo ? '' : 'background:#d8cbb3'};align-items:center;justify-content:center">
<div style="width:${pick(format, 760, 860, 900)}px;background:#ffe769;color:#262014;padding:${pick(format, 56, 70, 80)}px ${pick(format, 56, 66, 72)}px;transform:rotate(${c.tilt ?? -2.5}deg);box-shadow:0 30px 50px rgba(0,0,0,.35),inset 0 -30px 40px rgba(0,0,0,.04);font-family:'Noteworthy','Marker Felt','Bradley Hand','Segoe Print',cursive">
<div style="font-size:${pick(format, 64, 78, 86)}px;line-height:1.15;font-weight:700">${markup(c.headline)}</div>
${items.length ? `<div style="margin-top:${pick(format, 26, 36, 42)}px;display:flex;flex-direction:column;gap:${pick(format, 8, 14, 18)}px;font-size:${pick(format, 44, 54, 60)}px;line-height:1.25">${items.map((item) => `<div>${typeof item === 'object' && item.done ? '<s>' : ''}${markup(typeof item === 'object' ? item.text : item)}${typeof item === 'object' && item.done ? '</s>' : ''}</div>`).join('')}</div>` : ''}
</div>
<div style="position:absolute;left:72px;right:72px;bottom:calc(var(--safe-bottom) + 24px)">${footer(c, 'logo', !photo)}</div></div>`;
}

function pick(format, square, portrait, tall) {
  if (format.width === format.height) return square;
  return format.height >= 1900 ? tall : portrait;
}

// Native-looking styles default to a small logo only; Meta adds its own CTA button under the image.
function footer(c, fallback, light, compact = true, withBadge = false) {
  const mode = c.footer ?? fallback;
  if (mode === 'none') return '';
  if (mode === 'logo') {
    const logo = light ? brand.logo : brand.logoDark ?? brand.logo;
    return `<div class="cta-row" style="justify-content:flex-end">${logo ? `<img src="${logo}" alt="${esc(brand.name)}" style="height:44px;width:auto;max-width:420px;opacity:.85">` : `<span class="brandline">${esc(brand.name)}</span>`}</div>`;
  }
  return ctaRow(withBadge, compact, light, c.cta ?? defaults.cta);
}

function logoLine(dark) {
  const logo = dark ? brand.logoDark ?? brand.logo : brand.logo;
  if (logo) {
    return `<img class="logo" src="${logo}" alt="${esc(brand.name)}">`;
  }
  return `<div class="brandline">${esc(brand.name)}</div>`;
}

function ctaRow(withBadge = true, compact = false, light = true, label = defaults.cta) {
  const cta = label ? `<span class="cta" style="${compact ? 'font-size:30px;padding:18px 34px' : ''}">${esc(label)}</span>` : '';
  const badge = withBadge && brand.badge ? `<img class="badge" src="${brand.badge}">` : '';
  const logo = compact ? `<span style="margin-left:auto">${logoLine(!light)}</span>` : '';
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

// Turns hooks x layouts x CTAs into creatives so one variable can be read across many ads.
// "balanced" rotates CTAs so each hook and layout sees all of them without multiplying the ad count.
function expandMatrix(matrix) {
  if (!matrix) return [];
  const { round = 'r1', hooks = [], layouts = [], ctas = [], design = 'balanced' } = matrix;
  if (!['balanced', 'full'].includes(design)) {
    fail(`job.matrix.design must be balanced or full, got: ${design}`);
  }
  if (hooks.length === 0 || layouts.length === 0) {
    fail('job.matrix needs at least one hook and one layout');
  }
  for (const [label, list] of [['hooks', hooks], ['layouts', layouts], ['ctas', ctas]]) {
    for (const [index, item] of list.entries()) {
      if (!item.id || !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) {
        fail(`job.matrix.${label}[${index}].id must be lowercase letters, numbers, and dashes`);
      }
    }
  }
  const creatives = [];
  hooks.forEach((hook, hookIndex) => {
    if (!hook.text) fail(`job.matrix hook ${hook.id} needs text`);
    layouts.forEach((layout, layoutIndex) => {
      const { id: layoutId, hookField = 'headline', ...fields } = layout;
      const rotation = ctas.length ? [ctas[(hookIndex + layoutIndex) % ctas.length]] : [null];
      for (const cta of design === 'full' && ctas.length ? ctas : rotation) {
        creatives.push({
          ...fields,
          id: [round, hook.id, layoutId, cta?.id].filter(Boolean).join('-'),
          adSet: `${round}-${hook.id}`,
          family: hook.type ?? fields.family,
          style: fields.style ?? fields.template,
          [hookField]: hook.text,
          metaHeadline: hook.metaHeadline ?? stripMarkup(hook.text),
          primaryText: [hook.primaryText, cta?.closer].filter(Boolean).join(' '),
          primaryTextLong: [hook.primaryTextLong, cta?.closer].filter(Boolean).join('\n\n'),
          ...(cta?.text ? { cta: cta.text } : {}),
          ...(cta?.metaCta ? { metaCta: cta.metaCta } : {}),
          test: { round, hook: hook.id, hookType: hook.type ?? null, layout: layoutId, cta: cta?.id ?? null }
        });
      }
    });
  });
  return creatives;
}

// A carousel is one ad: its cards render as separate images that share the ad's copy.
function expandCarousels(carousels) {
  if (carousels === undefined) return [];
  if (!Array.isArray(carousels)) fail('job.carousels must be an array');
  return carousels.flatMap((carousel, index) => {
    const { id, cards, ...shared } = carousel;
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      fail(`job.carousels[${index}].id must be lowercase letters, numbers, and dashes`);
    }
    if (!Array.isArray(cards) || cards.length < 2 || cards.length > 10) {
      fail(`carousel ${id} needs 2 to 10 cards`);
    }
    return cards.map((card, cardIndex) => {
      const { cardHeadline: headline, cardDescription: description, ...fields } = card;
      return {
        formats: ['1:1'],
        ...shared,
        ...fields,
        id: `${id}-card${cardIndex + 1}`,
        carousel: { id, position: cardIndex + 1, headline: headline ?? '', description: description ?? '' }
      };
    });
  });
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
    if (creative.footer !== undefined && !['full', 'logo', 'none'].includes(creative.footer)) {
      fail(`creative ${creative.id} has unknown footer: ${creative.footer} (expected full, logo, none)`);
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
  const columns = ['adSet', 'adName', 'format', 'style', 'image', 'primaryText', 'primaryTextLong', 'headline', 'description', 'cta', 'url'];
  const testColumns = ['hook', 'layout', 'ctaVariant'];
  const hasTest = rows.some((row) => row.test);
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const testCells = (row) => [row.test?.hook, row.test?.layout, row.test?.cta].map(cell);
  const header = hasTest ? [...columns, ...testColumns] : columns;
  return `${header.join(',')}\n${rows.map((row) => [...columns.map((column) => cell(row[column])), ...(hasTest ? testCells(row) : [])].join(',')).join('\n')}\n`;
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
  scorecard   readable shortlist of scored items, built in HTML (not a screenshot)
  poll        story-style poll sticker, optionally over a photo
  search      search bar with typed query and suggestions
  ticket      boarding-pass card for travel and event timing
  calendar    big calendar page with an agenda
  status      big centred text on a coloured background, like a text-only post
              ("color": brand, sunset, ocean, violet, red, black or any CSS)
  caption     plain caption bar above a photo, like a shared post
  sticky      handwritten sticky note, optionally stuck over a photo

Add a "matrix" to a job to generate a creative test: hooks x layouts x CTAs,
one ad set per hook. Every manifest row records its hook, layout and CTA so
scripts/score-ad-results.mjs can rank them from a Meta results export.

Add "carousels" to a job to build multi-image ads: each has an id, shared ad
copy, and 2 to 10 cards that use any style. Cards default to 1:1.

Native styles (post, thread, notes, poll, status, caption, sticky) show a
small logo or nothing by default,
because Meta adds its own CTA button. Set "footer": "full", "logo" or "none"
on a creative to override.

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

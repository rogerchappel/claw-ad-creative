import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(creatives, extra = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'claw-render-test-'));
  temporaryDirectories.push(root);
  await writeFile(path.join(root, 'shot.png'), 'PNG');
  await writeFile(path.join(root, 'photo.jpg'), 'JPG');
  const job = {
    brand: { name: 'Test Brand' },
    defaults: { cta: 'Try it', url: 'https://example.com/app', utm: { source: 'meta', campaign: 'launch' } },
    assets: { shot: 'shot.png', photo: 'photo.jpg' },
    creatives,
    ...extra
  };
  const jobFile = path.join(root, 'job.json');
  await writeFile(jobFile, JSON.stringify(job));
  return { root, jobFile, out: path.join(root, 'out') };
}

function render(jobFile, out, extraArguments = []) {
  return spawnSync(process.execPath, ['scripts/render-ad-creatives.mjs', '--job', jobFile, '--out-dir', out, '--html-only', ...extraArguments], { encoding: 'utf8' });
}

const sample = [
  { id: 'device-one', adSet: 'set-a', template: 'device', screenshot: 'shot', headline: 'Score *faster*', primaryText: 'Body "quoted"' },
  { id: 'photo-one', adSet: 'set-b', template: 'photo', background: 'photo', headline: 'Out in the field', formats: ['9:16'] },
  { id: 'thread-one', adSet: 'set-b', template: 'thread', messages: [{ from: 'them', text: 'Hi <b>' }, { from: 'me', image: 'shot' }] }
];

test('writes html, manifest, copy CSV, and contact sheet for every format', async () => {
  const { jobFile, out } = await setup(sample);
  const result = render(jobFile, out);

  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  assert.equal(manifest.creatives.length, 7);
  const device = manifest.creatives.find((row) => row.id === 'device-one' && row.format === '4:5');
  assert.equal(device.adName, 'set-a__device-one__4x5');
  assert.equal(device.headline, 'Score faster');
  assert.equal(device.url, 'https://example.com/app?utm_source=meta&utm_campaign=launch&utm_content=device-one');
  assert.equal(device.image, null);

  const html = await readFile(path.join(out, 'html', 'thread-one_9x16.html'), 'utf8');
  assert.match(html, /Hi &lt;b&gt;/);
  assert.match(html, /--safe-top:270px/);

  const csv = await readFile(path.join(out, 'meta-copy.csv'), 'utf8');
  assert.match(csv, /"Body ""quoted"""/);
  assert.match(await readFile(path.join(out, 'contact-sheet.html'), 'utf8'), /set-b \(4\)/);
});

test('--only renders a single creative', async () => {
  const { jobFile, out } = await setup(sample);
  const result = render(jobFile, out, ['--only', 'photo-one']);

  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.creatives.map((row) => row.adName), ['set-b__photo-one__9x16']);
});

test('rejects unknown templates, formats, assets, and duplicate ids', async () => {
  const cases = [
    [[{ id: 'a', template: 'banner' }], /unknown template: banner/],
    [[{ id: 'a', template: 'statement', headline: 'x', formats: ['2:3'] }], /unknown format: 2:3/],
    [[{ id: 'a', template: 'device', screenshot: 'missing', headline: 'x' }], /unknown asset: missing/],
    [[{ id: 'a', template: 'statement' }, { id: 'a', template: 'statement' }], /duplicate creative id: a/],
    [[{ id: 'Bad Id', template: 'statement' }], /lowercase letters, numbers, and dashes/]
  ];
  for (const [creatives, pattern] of cases) {
    const { jobFile, out } = await setup(creatives);
    const result = render(jobFile, out);
    assert.equal(result.status, 1);
    assert.match(result.stderr, pattern);
  }
});

test('rejects a missing asset file and unknown options before writing output', async () => {
  const { jobFile, out } = await setup(sample, { assets: { shot: 'nope.png' } });
  const missing = render(jobFile, out);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /job.assets.shot must be an existing readable file/);

  const unknown = render(jobFile, out, ['--formt', '1:1']);
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stderr, 'ERROR: unrecognized option: --formt\nRun with --help for usage.\n');
  await assert.rejects(readFile(path.join(out, 'manifest.json')), { code: 'ENOENT' });
});

test('renders the newer styles and applies the footer option', async () => {
  const { jobFile, out } = await setup([
    { id: 'card', template: 'scorecard', headline: 'Top *picks*', lots: [{ lot: '7', label: 'First <one>', tags: ['Fast'], score: 9 }], formats: ['4:5'] },
    { id: 'poll', template: 'poll', background: 'photo', question: 'Which?', options: ['A', 'B'], formats: ['9:16'] },
    { id: 'search', template: 'search', query: 'how to', suggestions: ['…fast'], formats: ['1:1'] },
    { id: 'ticket', template: 'ticket', from: 'AAA', to: 'BBB', fields: [{ label: 'Date', value: '1 Jan' }], formats: ['4:5'] },
    { id: 'calendar', template: 'calendar', month: 'JAN', day: '12', items: [{ text: 'Go' }], formats: ['4:5'] },
    { id: 'thread-full', template: 'thread', footer: 'full', messages: [{ from: 'me', text: 'hi' }], formats: ['4:5'] },
    { id: 'notes-default', template: 'notes', items: ['x'], formats: ['4:5'] }
  ]);
  const result = render(jobFile, out);
  assert.equal(result.status, 0, result.stderr);

  const card = await readFile(path.join(out, 'html', 'card_4x5.html'), 'utf8');
  assert.match(card, /First &lt;one&gt;/);
  assert.match(card, />9\.0</);
  assert.match(await readFile(path.join(out, 'html', 'thread-full_4x5.html'), 'utf8'), /class="cta"/);
  assert.doesNotMatch(await readFile(path.join(out, 'html', 'notes-default_4x5.html'), 'utf8'), /class="cta"/);
});

test('renders the native status, caption and sticky styles', async () => {
  const { jobFile, out } = await setup([
    { id: 'status', template: 'status', color: 'ocean', headline: 'Short <hot> take', formats: ['4:5'] },
    { id: 'caption', template: 'caption', background: 'photo', headline: 'Me on day 3', byline: false, formats: ['9:16'] },
    { id: 'sticky', template: 'sticky', headline: 'Note to self:', items: ['one', { text: 'two', done: true }], formats: ['1:1'] }
  ]);
  const result = render(jobFile, out);
  assert.equal(result.status, 0, result.stderr);

  const status = await readFile(path.join(out, 'html', 'status_4x5.html'), 'utf8');
  assert.match(status, /Short &lt;hot&gt; take/);
  assert.match(status, /#3aa0e8/);
  assert.doesNotMatch(status, /class="cta"/);
  assert.match(await readFile(path.join(out, 'html', 'caption_9x16.html'), 'utf8'), /photo\.jpg/);
  assert.match(await readFile(path.join(out, 'html', 'sticky_1x1.html'), 'utf8'), /<s>two<\/s>/);
});

test('expands a balanced test matrix and records each variable', async () => {
  const hooks = ['one', 'two', 'three', 'four'].map((name, index) => ({ id: `h${index + 1}`, type: 'label', text: `Hook *${name}*`, primaryText: `Body ${name}.` }));
  const layouts = [{ id: 'status', template: 'status' }, { id: 'photo', template: 'photo', background: 'photo' }, { id: 'search', template: 'search', hookField: 'body', query: 'q' }];
  const ctas = [{ id: 'c1', text: 'Try it', metaCta: 'DOWNLOAD', closer: 'Free.' }, { id: 'c2', text: 'See more', metaCta: 'LEARN_MORE', closer: 'Look.' }];
  const { jobFile, out } = await setup(undefined, { creatives: undefined, matrix: { round: 'r2', hooks, layouts, ctas }, defaults: { formats: ['4:5'] } });
  const result = render(jobFile, out);
  assert.equal(result.status, 0, result.stderr);

  const { creatives } = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  assert.equal(creatives.length, 12);
  assert.equal(new Set(creatives.map((row) => row.adSet)).size, 4);
  const first = creatives[0];
  assert.deepEqual(first.test, { round: 'r2', hook: 'h1', hookType: 'label', layout: 'status', cta: 'c1' });
  assert.equal(first.id, 'r2-h1-status-c1');
  assert.equal(first.primaryText, 'Body one. Free.');
  assert.equal(first.headline, 'Hook one');
  assert.equal(first.cta, 'DOWNLOAD');
  for (const hook of ['h1', 'h2', 'h3', 'h4']) {
    const seen = new Set(creatives.filter((row) => row.test.hook === hook).map((row) => row.test.cta));
    assert.equal(seen.size, 2, `${hook} should see both CTAs`);
  }
  const photo = await readFile(path.join(out, 'html', 'r2-h1-photo-c2_4x5.html'), 'utf8');
  assert.match(photo, /See more/);
  assert.match(await readFile(path.join(out, 'html', 'r2-h1-search-c1_4x5.html'), 'utf8'), /Hook <em>one<\/em>/);
  assert.match(await readFile(path.join(out, 'meta-copy.csv'), 'utf8'), /,"h1","status","c1"/);
});

test('full matrix design multiplies CTAs and bad matrices fail', async () => {
  const hooks = [{ id: 'h1', text: 'Hook' }];
  const layouts = [{ id: 'status', template: 'status' }];
  const ctas = [{ id: 'c1' }, { id: 'c2' }];
  const { jobFile, out } = await setup(undefined, { creatives: undefined, matrix: { hooks, layouts, ctas, design: 'full' } });
  assert.equal(render(jobFile, out).status, 0);
  const { creatives } = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual([...new Set(creatives.map((row) => row.id))], ['r1-h1-status-c1', 'r1-h1-status-c2']);

  for (const [matrix, pattern] of [[{ hooks, layouts: [] }, /at least one hook/], [{ hooks: [{ id: 'Bad', text: 'x' }], layouts }, /lowercase/], [{ hooks: [{ id: 'h1' }], layouts }, /needs text/], [{ hooks, layouts, design: 'x' }, /balanced or full/]]) {
    const bad = await setup(undefined, { creatives: undefined, matrix });
    const failed = render(bad.jobFile, bad.out);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, pattern);
  }
});

test('renders carousels as cards that share one ad', async () => {
  const carousels = [{ id: 'car-one', adSet: 'set-a', primaryText: 'Short.', primaryTextLong: 'Long.', test: { hook: 'h1', layout: 'carousel', cta: null }, cards: [
    { template: 'status', headline: 'First', cardHeadline: 'Card one', cardDescription: 'More' },
    { template: 'statement', headline: 'Last' }
  ] }];
  const { jobFile, out } = await setup(undefined, { creatives: undefined, carousels });
  const result = render(jobFile, out);
  assert.equal(result.status, 0, result.stderr);

  const { creatives } = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual(creatives.map((row) => [row.id, row.format, row.primaryTextLong]), [['car-one-card1', '1:1', 'Long.'], ['car-one-card2', '1:1', 'Long.']]);
  assert.deepEqual(creatives[0].carousel, { id: 'car-one', position: 1, headline: 'Card one', description: 'More' });

  for (const [bad, pattern] of [[[{ id: 'x', cards: [{ template: 'status' }] }], /2 to 10 cards/], [[{ id: 'Bad', cards: [] }], /lowercase/], ['nope', /must be an array/]]) {
    const failing = await setup(undefined, { creatives: undefined, carousels: bad });
    const failed = render(failing.jobFile, failing.out);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, pattern);
  }
});

test('rejects an unknown footer value', async () => {
  const { jobFile, out } = await setup([{ id: 'a', template: 'statement', footer: 'big' }]);
  const result = render(jobFile, out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown footer: big/);
});

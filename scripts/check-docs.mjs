import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'README.md',
  'manifest.json',
  'docs/architecture.md',
  'docs/crewcmd-installation.md',
  'docs/mcp-installation.md',
  'docs/workflow.md',
  'docs/report-template.md',
  'examples/catalogue-viewer-brief.md',
  'examples/openclaw-agent-config.md',
  'skills/facebook-ad-creative/SKILL.md',
  'skills/facebook-ad-creative/skill.json',
  'skills/facebook-ad-creative/references/research.md',
  'skills/facebook-ad-creative/references/creative-strategy.md',
  'skills/facebook-ad-creative/references/asset-generation.md',
  'skills/facebook-ad-creative/references/reporting.md'
];

const failures = [];

for (const file of required) {
  const fullPath = path.join(root, file);
  let text = '';

  try {
    text = readFileSync(fullPath, 'utf8');
  } catch {
    failures.push(`missing required file: ${file}`);
    continue;
  }

  if (!text.trim()) {
    failures.push(`empty required file: ${file}`);
  }
}

for (const file of listMarkdown(root)) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, 'utf8');

  if (text.includes('{{') || text.includes('}}')) {
    failures.push(`unresolved template marker in ${rel}`);
  }

  if (/\bFAL_KEY\s*=\s*['"][^'"]+['"]/.test(text)) {
    failures.push(`example FAL_KEY appears to contain a real value in ${rel}`);
  }
}

for (const file of ['manifest.json', 'skills/facebook-ad-creative/skill.json']) {
  try {
    JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  } catch (error) {
    failures.push(`invalid JSON in ${file}: ${error.message}`);
  }
}

const manifest = readJson('manifest.json');
const skillJson = readJson('skills/facebook-ad-creative/skill.json');

if (manifest && skillJson) {
  if (manifest.slug !== skillJson.slug) {
    failures.push('manifest slug does not match skill.json slug');
  }

  if (!skillJson.metadata?.configSchema?.properties?.falSecretRef) {
    failures.push('skill.json missing falSecretRef config schema');
  }

  if (skillJson.metadata?.configExample?.canPublishAds !== false) {
    failures.push('skill config example must keep canPublishAds false');
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log('Documentation checks passed.');

function* listMarkdown(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules') continue;

    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      yield* listMarkdown(fullPath);
    } else if (entry.endsWith('.md')) {
      yield fullPath;
    }
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  } catch {
    return null;
  }
}

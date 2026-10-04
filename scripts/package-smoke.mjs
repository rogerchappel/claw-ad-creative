import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
const output = `${result.stdout || ''}\n${result.stderr || ''}`;
if (result.status !== 0) {
  process.stderr.write(output);
  process.exit(result.status || 1);
}

let pack;
try {
  [pack] = JSON.parse(result.stdout);
} catch {
  console.error(`package smoke could not parse npm pack output:\n${output}`);
  process.exit(1);
}
if (!Array.isArray(pack?.files)) {
  console.error('package smoke did not receive an npm pack file list');
  process.exit(1);
}

const required = [
  'docs/architecture.md',
  'docs/workflow.md',
  'examples/catalogue-viewer-brief.md',
  'examples/openclaw-agent-config.md',
  'skills/facebook-ad-creative/SKILL.md',
  'skills/facebook-ad-creative/skill.json',
  'scripts/check-docs.mjs',
  'scripts/install-mcps.sh',
  'README.md',
  'LICENSE'
];

const packedFiles = pack.files.map(({ path }) => path);
const allowed = new Set([
  ...required,
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'package.json',
  'docs/crewcmd-installation.md',
  'docs/mcp-installation.md',
  'docs/ORCHESTRATION.md',
  'docs/README.md',
  'docs/report-template.md',
  'docs/TASKS.md',
  'examples/thoroughbreds-ai-creative-pack.md',
  'scripts/create-ad-batch.mjs',
  'scripts/create-device-creative-prompt.mjs',
  'scripts/package-smoke.mjs',
  'scripts/print-openclaw-config.mjs',
  'scripts/validate.sh',
  'skills/facebook-ad-creative/agents/openai.yaml',
  'skills/facebook-ad-creative/references/asset-generation.md',
  'skills/facebook-ad-creative/references/creative-strategy.md',
  'skills/facebook-ad-creative/references/reporting.md',
  'skills/facebook-ad-creative/references/research.md'
]);
function validatePackageFiles(files) {
  const missing = required.filter((entry) => !files.includes(entry));
  if (missing.length > 0) return `package smoke missing entries:\n${missing.join('\n')}`;
  const unexpected = files.filter((entry) => !allowed.has(entry));
  if (unexpected.length > 0) return `package smoke found unexpected entries:\n${unexpected.join('\n')}`;
  return null;
}

const error = validatePackageFiles(packedFiles);
if (error) {
  console.error(error);
  process.exit(1);
}

console.log('package smoke passed');

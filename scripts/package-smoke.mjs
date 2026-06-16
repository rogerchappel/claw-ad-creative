import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['pack', '--dry-run'], { encoding: 'utf8' });
const output = `${result.stdout || ''}\n${result.stderr || ''}`;
if (result.status !== 0) {
  process.stderr.write(output);
  process.exit(result.status || 1);
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

const missing = required.filter((entry) => !output.includes(entry));
if (missing.length > 0) {
  console.error(`package smoke missing entries:\n${missing.join('\n')}`);
  process.exit(1);
}

console.log('package smoke passed');

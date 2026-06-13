#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const brandName = required(args, 'brand-name');
const audience = required(args, 'audience');
const offer = required(args, 'offer');
const cta = required(args, 'cta');

const screenshots = asArray(args.screenshot);
if (screenshots.length === 0) {
  fail('missing required --screenshot path');
}

const aspectRatio = args['aspect-ratio'] ?? '4:5';
const provider = args.provider ?? 'runtime-selected';
const model = args.model ?? 'runtime-selected';
const style = args.style ?? 'premium 3D field lifestyle';
const scene =
  args.scene ??
  'premium field lifestyle scene with sale-day desk props, catalogue pages, notes, pen, and relevant real-world environment';
const angle =
  args.angle ??
  'phone on the right side, angled slightly toward the viewer, left edge marginally closer to camera';

const brand = {
  name: brandName,
  url: args['brand-url'] ?? null,
  logo: args.logo ?? null,
  colors: {
    primary: args.primary ?? null,
    secondary: args.secondary ?? null,
    accent: args.accent ?? null
  },
  typography: args.typography ?? 'brand-appropriate headline and clean body typography'
};

const promptPack = {
  version: 1,
  kind: 'model-rendered-device-creative-prompt-pack',
  provider,
  model,
  brand,
  product: {
    screenshots,
    offer,
    cta
  },
  audience: {
    segment: audience
  },
  asset: {
    aspectRatio,
    style,
    scene,
    device: args.device ?? 'iPhone',
    angle
  },
  prompts: {
    devicePlate: buildDevicePlatePrompt({
      brand,
      audience,
      offer,
      cta,
      aspectRatio,
      style,
      scene,
      angle,
      device: args.device ?? 'iPhone'
    }),
    screenshotConditioning: buildScreenshotPrompt({
      device: args.device ?? 'iPhone',
      angle
    }),
    finalAssembly: buildFinalAssemblyInstructions({ brand, cta })
  },
  negativePrompt: [
    'fake cutout edge around the phone',
    'thick black side slab behind the phone',
    'floating phone with impossible shadow',
    'wrong device angle',
    'warped screenshot UI',
    'rewritten app text',
    'invented brand logo',
    'rendered CTA text in the model output',
    'watermark',
    'distorted hands, horses, or anatomy'
  ],
  reviewChecklist: [
    'The 3D phone/device angle is rendered by the model, not faked with code.',
    'The device has a thin realistic side edge, bevel, glass reflection, and contact shadow.',
    'There is no cutout plate, black slab, or visible compositing seam around the phone.',
    'The screen UI is either preserved from the screenshot or deliberately left blank for controlled replacement.',
    'Brand text and CTA are added in the template layer, not hallucinated by the model.',
    'The output can be reused for another brand by changing only this prompt pack input profile.'
  ]
};

const json = `${JSON.stringify(promptPack, null, 2)}\n`;

if (args.out) {
  writeFileSync(args.out, json, 'utf8');
  console.log(args.out);
} else {
  process.stdout.write(json);
}

function buildDevicePlatePrompt(input) {
  const colors = [
    input.brand.colors.primary,
    input.brand.colors.secondary,
    input.brand.colors.accent
  ]
    .filter(Boolean)
    .join(', ');

  return [
    `Create a premium ${input.aspectRatio} Meta ad visual for ${input.brand.name} targeting ${input.audience}.`,
    `Scene: ${input.scene}.`,
    `Physical device: realistic 3D ${input.device} in this angle: ${input.angle}.`,
    'The device must have a thin realistic metal side edge, bevels, screen glass reflection, and a soft contact shadow that matches the scene.',
    'Screen: use a blank dark screen unless the runtime provider supports high-fidelity image-conditioned screen replacement from the supplied screenshot.',
    `Brand feel: ${input.style}.`,
    colors ? `Brand color direction: ${colors}.` : 'Brand color direction: infer from the supplied brand profile.',
    'Composition: leave clean negative space for headline and CTA. Do not render final brand text, CTA text, disclaimers, or small UI text in the model output.',
    'Avoid: fake cutout edges, a thick black side slab, floating device, impossible shadows, warped UI, unreadable text, rendered logos, and watermarks.'
  ].join('\n');
}

function buildScreenshotPrompt({ device, angle }) {
  return [
    `Place the supplied screenshot onto the ${device} screen while preserving the model-rendered physical angle: ${angle}.`,
    'Preserve the screenshot content exactly. Do not rewrite, summarize, translate, crop critical UI, or invent interface text.',
    'Match screen perspective, brightness, glass reflection, and edge masking to the device render.',
    'Reject the result if the UI text becomes semantically different or visibly distorted.'
  ].join('\n');
}

function buildFinalAssemblyInstructions({ brand, cta }) {
  return [
    'Use deterministic layout only after the model-rendered device plate is accepted.',
    `Add the ${brand.name} logo and exact brand text from the brand profile.`,
    `Add the exact CTA: "${cta}".`,
    'Apply final crop, export, contact sheet, and manifest generation in the CLI.',
    'Do not add artificial 3D side depth, bevels, or phone slabs during final assembly.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      fail(`unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[i + 1];

    if (!value || value.startsWith('--')) {
      fail(`missing value for --${key}`);
    }

    if (parsed[key] === undefined) {
      parsed[key] = value;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(value);
    } else {
      parsed[key] = [parsed[key], value];
    }

    i += 1;
  }

  return parsed;
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function required(source, key) {
  const value = source[key];
  if (!value) fail(`missing required --${key}`);
  return value;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  console.error('Run with --help for usage.');
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  node scripts/create-device-creative-prompt.mjs \\
    --brand-name "Thoroughbreds.ai" \\
    --brand-url "https://www.thoroughbreds.ai" \\
    --logo "/path/to/logo.png" \\
    --primary "#123e34" \\
    --accent "#c49a4f" \\
    --screenshot "/path/to/screenshot.png" \\
    --audience "bloodstock agents" \\
    --offer "Free iOS catalogue viewer" \\
    --cta "Install Free" \\
    --provider "fal" \\
    --model "runtime-selected" \\
    --out "/tmp/device-creative-prompt.json"

Required:
  --brand-name, --screenshot, --audience, --offer, --cta

Optional:
  --brand-url, --logo, --primary, --secondary, --accent, --typography,
  --aspect-ratio, --provider, --model, --style, --scene, --device, --angle,
  --out
`);
}

#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const brand = {
  name: required(args, 'brand'),
  url: args['brand-url'] ?? null,
  logo: args.logo ?? null,
  colors: parseColors(args),
  typography: args.typography ?? 'brand-appropriate clean mobile ad typography'
};

const audience = required(args, 'audience');
const offer = required(args, 'offer');
const cta = args.cta ?? 'Learn More';
const count = parsePositiveInteger(args.count ?? '20', 'count');
const formats = splitList(args.formats ?? '9:16,4:5,1:1');
const publishMode = args['publish-mode'] ?? 'drafts-only';
const landingPage = args['landing-page'] ?? brand.url;
const outDir = path.resolve(args['out-dir'] ?? `output/ad-batches/${slugify(brand.name)}`);

if (publishMode !== 'drafts-only') {
  fail('only --publish-mode drafts-only is supported by this CLI');
}

if (!landingPage) {
  fail('missing --landing-page or --brand-url');
}

const researchInputs = collectResearchInputs(args);
const researchPlan = buildResearchPlan({ brand, audience, offer, researchInputs });
const insights = buildInsights({ audience, offer, researchInputs });
const concepts = buildConcepts({ brand, audience, offer, cta, landingPage, insights });
const variants = buildVariants({ brand, audience, offer, cta, landingPage, formats, count, concepts, insights });
const prompts = variants.map((variant) => buildAssetPrompt({ brand, variant }));
const metaDraftPlan = buildMetaDraftPlan({ brand, audience, offer, cta, variants, publishMode });
const approvalPack = buildApprovalPack({
  brand,
  audience,
  offer,
  cta,
  landingPage,
  researchPlan,
  insights,
  concepts,
  variants,
  prompts,
  publishMode
});

mkdirSync(outDir, { recursive: true });

writeJson(path.join(outDir, 'brand-profile.json'), brand);
writeJson(path.join(outDir, 'research-plan.json'), researchPlan);
writeJson(path.join(outDir, 'insight-brief.json'), insights);
writeJson(path.join(outDir, 'meta-draft-plan.json'), metaDraftPlan);
writeFileSync(path.join(outDir, 'copy-matrix.csv'), toCopyCsv(variants), 'utf8');
writeFileSync(path.join(outDir, 'asset-prompts.jsonl'), prompts.map((prompt) => JSON.stringify(prompt)).join('\n') + '\n', 'utf8');
writeFileSync(path.join(outDir, 'approval-pack.md'), approvalPack, 'utf8');

console.log(outDir);

function buildResearchPlan({ brand, audience, offer, researchInputs }) {
  const competitors = splitList(researchInputs.competitors.join(','));
  const sourceMix = [
    {
      source: 'owned landing pages',
      purpose: 'capture exact offer, product proof, claims, screenshots, brand language, and forbidden claims',
      queries: [brand.url, `${brand.name} ${offer}`].filter(Boolean)
    },
    {
      source: 'Meta Ads Library',
      purpose: 'collect active creative patterns, hooks, formats, offers, CTAs, and likely funnel stage',
      queries: [
        brand.name,
        ...competitors,
        `${audience} software`,
        `${offer} app`
      ].filter(Boolean)
    },
    {
      source: 'Reddit and forums',
      purpose: 'extract pain language, objections, buying triggers, and vocabulary used by the audience',
      queries: [
        `${audience} pain points`,
        `${audience} workflow complaints`,
        `${offer} alternative`,
        ...researchInputs.painPoints
      ].filter(Boolean)
    },
    {
      source: 'YouTube and short-form comments',
      purpose: 'find repeated questions, desired outcomes, objections, and hooks that match video-native language',
      queries: [
        `${audience} tips`,
        `${audience} software review`,
        `${offer} workflow`
      ].filter(Boolean)
    },
    {
      source: 'adjacent products',
      purpose: 'borrow pattern structure without copying creative, assets, or proprietary claims',
      queries: [
        ...competitors,
        `best apps for ${audience}`,
        `software for ${audience}`
      ].filter(Boolean)
    }
  ];

  return {
    version: 1,
    status: researchInputs.hasInputs ? 'source-informed scaffold' : 'research scaffold only',
    brand: brand.name,
    audience,
    offer,
    sourceMix,
    captureFields: [
      'source',
      'url',
      'observed date',
      'advertiser',
      'format',
      'hook',
      'opening frame',
      'core claim',
      'offer',
      'proof',
      'cta',
      'landing page',
      'visual style',
      'likely funnel stage',
      'why it might be working',
      'what not to copy'
    ],
    humanResearchTasks: [
      'Review 10 to 30 active or recent ads across direct, adjacent, and aspirational advertisers.',
      'Capture repeated hooks, repeated offers, objection handling, proof mechanisms, and long-running variants.',
      'Pull exact audience phrasing from Reddit, YouTube comments, reviews, sales calls, support tickets, and community posts.',
      'Turn research into pains, outcomes, objections, proof points, and vocabulary before approving final copy.',
      'Reject copy that makes unsupported performance claims or sounds unlike the audience.'
    ],
    suppliedInputs: researchInputs
  };
}

function buildInsights({ audience, offer, researchInputs }) {
  const painPoints = fillWithFallback(researchInputs.painPoints, [
    'Manual workflows slow down when the buying moment is time-sensitive.',
    `Important notes, screenshots, and decisions get scattered across tools.`,
    `${audience} want better context without replacing expert judgement.`
  ]);

  const outcomes = fillWithFallback(researchInputs.outcomes, [
    'turn raw information into a focused working list faster',
    'keep notes, scores, and context together',
    'make the next review or team discussion easier'
  ]);

  const objections = fillWithFallback(researchInputs.objections, [
    'I already have a manual workflow',
    'AI tools might overclaim or replace judgement',
    'I need a useful free starting point before I trust a platform'
  ]);

  const proofPoints = fillWithFallback(researchInputs.proofPoints, [
    'free mobile workflow',
    'mobile-first app experience',
    'structured notes, scoring, comparison, and context in one place'
  ]);

  const vocabulary = fillWithFallback(researchInputs.vocabulary, [
    'shortlist',
    'workflow',
    'context',
    'notes',
    'score',
    'compare',
    'review'
  ]);

  return {
    audience,
    copyStrategy: {
      principle: 'Write one sharp promise for one buyer moment; make the product useful before making it clever.',
      painPoints,
      desiredOutcomes: outcomes,
      objections,
      proofPoints,
      vocabulary
    },
    headlineRules: [
      'Lead with the buyer job, not the tool category.',
      'Prefer concrete outcomes over generic AI language.',
      'Use audience vocabulary from research notes.',
      'Keep each headline mobile-readable and test one idea at a time.'
    ],
    primaryTextRules: [
      'Name the moment or problem in the first sentence.',
      'Pair one pain with one product action.',
      'Avoid guaranteed outcomes, fake scarcity, and inflated performance claims.',
      'Make free or draft-only offers explicit when applicable.'
    ]
  };
}

function buildConcepts({ audience, offer, cta, landingPage, insights }) {
  const [painA, painB, painC] = insights.copyStrategy.painPoints;
  const [outcomeA, outcomeB, outcomeC] = insights.copyStrategy.desiredOutcomes;
  const [proofA, proofB] = insights.copyStrategy.proofPoints;

  return [
    {
      id: 'problem-solution-speed',
      name: 'Get To The Working List Faster',
      angle: 'pain-to-relief',
      audience,
      funnelStage: 'prospecting',
      buyerEmotion: 'pressure relief',
      hook: sentenceCase(outcomeA),
      proof: proofA,
      offer,
      cta,
      landingPage,
      researchHypothesis: painA
    },
    {
      id: 'notes-context',
      name: 'Keep The Context Together',
      angle: 'problem-solution',
      audience,
      funnelStage: 'prospecting',
      buyerEmotion: 'control',
      hook: sentenceCase(outcomeB),
      proof: proofB ?? proofA,
      offer,
      cta,
      landingPage,
      researchHypothesis: painB
    },
    {
      id: 'expert-judgement',
      name: 'Data That Respects Judgement',
      angle: 'objection-handling',
      audience,
      funnelStage: 'warm',
      buyerEmotion: 'trust',
      hook: sentenceCase(outcomeC),
      proof: 'data supports the workflow without replacing the decision maker',
      offer,
      cta,
      landingPage,
      researchHypothesis: painC
    },
    {
      id: 'product-demo',
      name: 'Show The Workflow',
      angle: 'product-demo',
      audience,
      funnelStage: 'prospecting',
      buyerEmotion: 'clarity',
      hook: `See how ${offer.toLowerCase()} fits the workday`,
      proof: 'real app screenshots in a practical workflow scene',
      offer,
      cta,
      landingPage,
      researchHypothesis: 'mobile users need to understand the product before they read the caption'
    },
    {
      id: 'start-free',
      name: 'Start Free, Go Deeper Later',
      angle: 'offer',
      audience,
      funnelStage: 'prospecting',
      buyerEmotion: 'low-risk trial',
      hook: 'Start with the useful free workflow',
      proof: 'free entry point with upgrade path when the workflow gets serious',
      offer,
      cta,
      landingPage,
      researchHypothesis: 'free utility reduces friction for niche professional software'
    }
  ];
}

function buildVariants({ brand, audience, offer, cta, landingPage, formats, count, concepts, insights }) {
  const headlineTemplates = [
    ({ outcome }) => sentenceCase(outcome),
    ({ offer }) => `${offer}: start faster`,
    ({ vocab }) => `${sentenceCase(vocab)} without the scramble`,
    ({ audience }) => `Built for ${audience}`,
    ({ proof }) => sentenceCase(proof)
  ];

  const primaryTemplates = [
    ({ pain, action }) => `${sentence(pain)} ${action}`,
    ({ outcome, proof }) => `${sentence(outcome)} Use ${withArticle(proof)} to keep the next decision moving.`,
    ({ audience, offer }) => `${sentenceCase(audience)} need tools that fit the way they already work. ${offer} gives the team a cleaner place to review, note, compare, and decide.`,
    ({ proof }) => `Keep the judgement. Add ${withArticle(proof)} where the manual work slows you down.`,
    ({ offer, cta }) => `${offer} is ready when the work gets busy. ${cta} and test it on the next active workflow.`
  ];

  const variants = [];
  let index = 0;

  while (variants.length < count) {
    const concept = concepts[index % concepts.length];
    const format = formats[index % formats.length];
    const headlineBuilder = headlineTemplates[index % headlineTemplates.length];
    const primaryBuilder = primaryTemplates[index % primaryTemplates.length];
    const vocab = pick(insights.copyStrategy.vocabulary, index);
    const pain = concept.researchHypothesis;
    const outcome = concept.hook;
    const proof = concept.proof;
    const objection = pick(insights.copyStrategy.objections, index);
    const action = actionFor(concept.angle, brand.name, offer, cta);

    variants.push({
      id: `${String(index + 1).padStart(3, '0')}-${concept.id}-${format.replace(':', 'x')}`,
      conceptId: concept.id,
      conceptName: concept.name,
      angle: concept.angle,
      funnelStage: concept.funnelStage,
      audience,
      format,
      offer,
      cta,
      headline: trimTo(headlineBuilder({ audience, offer, outcome, proof, vocab }), 72),
      primaryText: trimTo(primaryBuilder({ audience, offer, cta, pain, outcome, proof, objection, action }), 220),
      description: trimTo(`${brand.name} helps ${audience} keep the work organised before the next decision.`, 120),
      landingPage: withUtm(landingPage, {
        utm_source: 'meta',
        utm_medium: 'paid_social',
        utm_campaign: `${slugify(brand.name)}_bulk_creative`,
        utm_content: `${concept.id}_${format.replace(':', 'x')}`,
        utm_term: slugify(audience)
      }),
      researchHypothesis: concept.researchHypothesis,
      successMetric: concept.funnelStage === 'warm' ? 'signup conversion rate' : 'thumb-stop rate and outbound CTR',
      approvalStatus: 'draft only - requires human review'
    });

    index += 1;
  }

  return variants;
}

function buildAssetPrompt({ brand, variant }) {
  return {
    id: variant.id,
    conceptName: variant.conceptName,
    placement: 'Meta feed/story/reels creative',
    aspectRatio: variant.format,
    provider: 'runtime-selected',
    model: 'runtime-selected',
    prompt: [
      `Create a Meta ad visual for ${variant.audience} promoting ${variant.offer}.`,
      `Scene: brand-relevant real-world work setting for ${variant.audience}.`,
      'Subject: realistic phone or tablet showing the product workflow, with practical props that support the buyer moment.',
      `Composition: mobile-first ${variant.format} layout with clear space for headline and CTA.`,
      `Brand feel: ${brand.name}; ${brand.typography}.`,
      brand.colors.primary ? `Color direction: primary ${brand.colors.primary}, secondary ${brand.colors.secondary ?? 'brand secondary'}, accent ${brand.colors.accent ?? 'brand accent'}.` : 'Color direction: use the supplied brand profile.',
      'Text area: leave clean space for controlled headline and CTA layers; do not render final marketing text inside the image model output.',
      'Avoid: competitor marks, private customer data, fake UI text, unsupported claims, distorted device geometry, distorted hands, watermarks.'
    ].join('\n'),
    negativePrompt: [
      'rendered headline text',
      'rendered CTA text',
      'invented logo',
      'competitor branding',
      'unreadable generated UI text',
      'unsupported guarantee',
      'fake phone side slab',
      'watermark'
    ],
    copyLayer: {
      headline: variant.headline,
      primaryText: variant.primaryText,
      cta: variant.cta
    },
    outputFilename: `${variant.id}.png`,
    reviewNotes: [
      'Add brand/logo/text in controlled layout after image generation.',
      'Reject if the visual makes the product unclear or introduces unsupported claims.'
    ]
  };
}

function buildMetaDraftPlan({ brand, audience, offer, cta, variants, publishMode }) {
  return {
    version: 1,
    mode: publishMode,
    brand: brand.name,
    guardrails: [
      'Draft creation only.',
      'No publish, budget change, audience change, pixel change, or live edit without explicit human approval.',
      'No API credentials, account IDs, campaign IDs, customer lists, or private assets are stored in this plan.'
    ],
    campaign: {
      name: `${brand.name} - Bulk Creative Test - Drafts`,
      objective: 'traffic_or_app_installs_to_be_confirmed',
      audience,
      offer,
      cta
    },
    ads: variants.map((variant) => ({
      draftName: `${brand.name} - ${variant.id}`,
      creativeId: variant.id,
      format: variant.format,
      headline: variant.headline,
      primaryText: variant.primaryText,
      description: variant.description,
      cta: variant.cta,
      landingPage: variant.landingPage,
      status: 'draft_pending_human_review'
    }))
  };
}

function buildApprovalPack({ brand, audience, offer, cta, landingPage, researchPlan, insights, concepts, variants, prompts, publishMode }) {
  return `# ${brand.name} Bulk Meta Creative Approval Pack

Status: Draft approval pack only. No ad account action, publishing, budget
change, targeting change, or live edit is approved by this document.

## Brief

- Brand: ${brand.name}
- Brand URL: ${brand.url ?? 'not supplied'}
- Audience: ${audience}
- Offer: ${offer}
- CTA: ${cta}
- Landing page: ${landingPage}
- Publish mode: ${publishMode}
- Generated variants: ${variants.length}

## Research Plan

This batch is ${researchPlan.status}. Before launch, complete or import research
from Ads Library, Reddit/forums, YouTube/comments, owned pages, and adjacent
products.

${researchPlan.sourceMix
  .map((source) => `### ${source.source}

Purpose: ${source.purpose}

Queries:
${source.queries.map((query) => `- ${query}`).join('\n')}`)
  .join('\n\n')}

## Copy Research Brief

Pain points:
${insights.copyStrategy.painPoints.map((item) => `- ${item}`).join('\n')}

Desired outcomes:
${insights.copyStrategy.desiredOutcomes.map((item) => `- ${item}`).join('\n')}

Objections:
${insights.copyStrategy.objections.map((item) => `- ${item}`).join('\n')}

Proof points:
${insights.copyStrategy.proofPoints.map((item) => `- ${item}`).join('\n')}

## Concept Matrix

${concepts
  .map(
    (concept) => `### ${concept.name}

- Angle: ${concept.angle}
- Funnel stage: ${concept.funnelStage}
- Buyer emotion: ${concept.buyerEmotion}
- Hook: ${concept.hook}
- Proof: ${concept.proof}
- Research hypothesis: ${concept.researchHypothesis}
- Approval status: draft only - requires human review`
  )
  .join('\n\n')}

## Variant Preview

${variants
  .map(
    (variant) => `### ${variant.id}

- Concept: ${variant.conceptName}
- Format: ${variant.format}
- Headline: ${variant.headline}
- Primary text: ${variant.primaryText}
- CTA: ${variant.cta}
- Landing page: ${variant.landingPage}
- Success metric: ${variant.successMetric}
- Approval status: ${variant.approvalStatus}`
  )
  .join('\n\n')}

## Asset Prompt Files

The model prompt manifest is written to \`asset-prompts.jsonl\`.

Prompt records: ${prompts.length}

## Meta Draft Plan

The draft-only Meta import plan is written to \`meta-draft-plan.json\`.

Human approval required before any of:

- creating ad-account objects,
- publishing ads,
- changing budgets,
- changing targeting,
- editing live ads,
- uploading customer lists,
- changing pixels or billing settings.
`;
}

function collectResearchInputs(source) {
  const researchNoteFiles = asArray(source['research-note']);
  const researchNotes = researchNoteFiles.map((file) => ({
    file,
    text: readFileSync(file, 'utf8')
  }));

  return {
    hasInputs:
      Boolean(source.competitor) ||
      Boolean(source['research-source']) ||
      Boolean(source['pain-point']) ||
      Boolean(source.outcome) ||
      Boolean(source.objection) ||
      Boolean(source.proof) ||
      Boolean(source.vocabulary) ||
      researchNotes.length > 0,
    sources: asArray(source['research-source']),
    competitors: asArray(source.competitor),
    painPoints: [...asArray(source['pain-point']), ...extractLabeledNotes(researchNotes, 'pain')],
    outcomes: [...asArray(source.outcome), ...extractLabeledNotes(researchNotes, 'outcome')],
    objections: [...asArray(source.objection), ...extractLabeledNotes(researchNotes, 'objection')],
    proofPoints: [...asArray(source.proof), ...extractLabeledNotes(researchNotes, 'proof')],
    vocabulary: [...asArray(source.vocabulary), ...extractLabeledNotes(researchNotes, 'vocabulary')],
    notes: researchNotes.map((note) => ({ file: note.file }))
  };
}

function extractLabeledNotes(notes, label) {
  const matches = [];
  const re = new RegExp(`^\\\\s*(?:[-*]\\\\s*)?${label}s?\\\\s*:\\\\s*(.+)$`, 'gim');

  for (const note of notes) {
    for (const match of note.text.matchAll(re)) {
      matches.push(match[1].trim());
    }
  }

  return matches;
}

function parseColors(source) {
  return {
    primary: source.primary ?? null,
    secondary: source.secondary ?? null,
    accent: source.accent ?? null
  };
}

function toCopyCsv(variants) {
  const columns = [
    'id',
    'conceptName',
    'angle',
    'funnelStage',
    'audience',
    'format',
    'headline',
    'primaryText',
    'description',
    'cta',
    'landingPage',
    'researchHypothesis',
    'successMetric',
    'approvalStatus'
  ];

  return [
    columns.join(','),
    ...variants.map((variant) => columns.map((column) => csvEscape(variant[column])).join(','))
  ].join('\n') + '\n';
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function fillWithFallback(values, fallback) {
  const clean = values.filter(Boolean);
  return [...clean, ...fallback.filter((item) => !clean.includes(item))];
}

function actionFor(angle, brandName, offer, cta) {
  if (angle === 'product-demo') {
    return `See the ${offer.toLowerCase()} workflow before you commit.`;
  }
  if (angle === 'objection-handling') {
    return `${brandName} keeps the human decision in charge while organising the context around it.`;
  }
  if (angle === 'offer') {
    return `${cta} and test it on a real workflow.`;
  }
  return `${brandName} helps turn the messy middle into a clearer next step.`;
}

function withUtm(rawUrl, params) {
  const url = new URL(rawUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail(`--${name} must be a positive integer`);
  }
  return parsed;
}

function trimTo(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function sentenceCase(value) {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function sentence(value) {
  const clean = sentenceCase(String(value ?? '').trim());
  if (!clean) return clean;
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function withArticle(value) {
  const text = String(value ?? '').trim();
  if (!text) return text;
  if (/^(a|an|the)\s/i.test(text)) return text;
  return `the ${text}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pick(values, index) {
  return values[index % values.length];
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  npm run creative:batch -- \\
    --brand "Thoroughbreds.ai" \\
    --brand-url "https://www.thoroughbreds.ai" \\
    --audience "bloodstock agents" \\
    --offer "Free iOS catalogue viewer" \\
    --cta "Install Free" \\
    --count 40 \\
    --formats "9:16,4:5,1:1" \\
    --publish-mode drafts-only \\
    --out-dir output/ad-batches/thoroughbreds-ai

Required:
  --brand, --audience, --offer, plus --landing-page or --brand-url

Optional brand fields:
  --logo, --primary, --secondary, --accent, --typography

Optional research inputs:
  --research-source, --research-note, --competitor, --pain-point, --outcome,
  --objection, --proof, --vocabulary

Optional batch fields:
  --cta, --count, --formats, --landing-page, --publish-mode, --out-dir

Notes:
  This CLI is export-only. It writes a research plan, insight brief, copy matrix,
  image prompt manifest, approval pack, and Meta draft plan. It does not call
  Meta, Perplexity, Reddit, YouTube, or an image provider directly.
`);
}

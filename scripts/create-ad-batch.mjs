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
const scaleProfile = parseChoice(args['scale-profile'] ?? inferScaleProfile(count), 'scale-profile', [
  'launch-test',
  'scale-100',
  'custom'
]);
const adSetStrategy = parseChoice(args['ad-set-strategy'] ?? inferAdSetStrategy(count), 'ad-set-strategy', [
  'consolidated',
  'family',
  'family-segment'
]);
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
const batchStrategy = buildBatchStrategy({ args, audience, offer, count, formats, scaleProfile, adSetStrategy });
const researchPlan = buildResearchPlan({ brand, audience, offer, researchInputs });
const insights = buildInsights({ audience, offer, researchInputs });
const concepts = buildConcepts({ audience, offer, cta, landingPage, insights, batchStrategy });
const variants = buildVariants({ brand, audience, offer, cta, landingPage, formats, count, concepts, insights, batchStrategy });
const prompts = variants.map((variant) => buildAssetPrompt({ brand, variant }));
const metaDraftPlan = buildMetaDraftPlan({ brand, audience, offer, cta, variants, publishMode, batchStrategy });
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
  batchStrategy,
  prompts,
  publishMode
});

mkdirSync(outDir, { recursive: true });

writeJson(path.join(outDir, 'brand-profile.json'), brand);
writeJson(path.join(outDir, 'research-plan.json'), researchPlan);
writeJson(path.join(outDir, 'insight-brief.json'), insights);
writeJson(path.join(outDir, 'scale-plan.json'), batchStrategy);
writeJson(path.join(outDir, 'meta-draft-plan.json'), metaDraftPlan);
writeFileSync(path.join(outDir, 'copy-matrix.csv'), toCopyCsv(variants), 'utf8');
writeFileSync(path.join(outDir, 'asset-prompts.jsonl'), prompts.map((prompt) => JSON.stringify(prompt)).join('\n') + '\n', 'utf8');
writeFileSync(path.join(outDir, 'approval-pack.md'), approvalPack, 'utf8');

console.log(outDir);

function familyBlueprints() {
  return [
  {
    id: 'native-text-story',
    name: 'Native Text Story',
    angle: 'native-story',
    funnelStage: 'prospecting',
    buyerEmotion: 'recognition',
    creativeType: 'static text-over-image',
    formatBias: ['4:5', '1:1'],
    successMetric: 'thumb-stop rate, outbound CTR, and landing-page view quality',
    scaleRole: 'turn audience pain language into simple feed-native ads',
    executions: [
      {
        id: 'familiar-problem',
        name: 'The Familiar Problem',
        openingFrame: 'plain native post with one direct pain statement',
        visualDirection: 'off-white or brand-neutral background, small product screenshot, high-legibility text',
        headline: ({ pain }) => sentenceCase(pain),
        primary: ({ pain, brand, offer }) =>
          `${sentence(pain)} ${brand.name} gives ${withArticle(offer.toLowerCase())} a clearer place to start.`
      },
      {
        id: 'before-you-start',
        name: 'Before You Start',
        openingFrame: 'job-to-be-done reminder before the buyer begins the workflow',
        visualDirection: 'work surface, notes, product screen, and one strong visual cue from the industry',
        headline: ({ vocab }) => `Before you ${verbFor(vocab)}, open the workflow.`,
        primary: ({ offer, vocab }) =>
          `Before the next ${vocab}, use ${withArticle(offer.toLowerCase())} to keep the important context in one place.`
      },
      {
        id: 'old-way-new-way',
        name: 'Old Way vs New Way',
        openingFrame: 'split old manual workflow against a cleaner product workflow',
        visualDirection: 'split-screen comparison with manual clutter on one side and app/product clarity on the other',
        headline: ({ vocab }) => `The old way vs the clearer ${vocab}.`,
        primary: ({ proof, offer }) =>
          `The old way scatters decisions across tools. ${sentenceCase(offer)} brings ${withArticle(proof)} into one cleaner flow.`
      },
      {
        id: 'for-diligent-operators',
        name: 'For The Buyer Who Checks Everything',
        openingFrame: 'respectful callout to the detailed professional',
        visualDirection: 'minimal mature design with product screenshot and research/context visual',
        headline: ({ audience }) => `For ${audience} who check everything.`,
        primary: ({ audience, offer }) =>
          `If you already do the detailed work, ${offer.toLowerCase()} should support that process instead of replacing it.`
      }
    ]
  },
  {
    id: 'phone-demo-video',
    name: 'Phone Demo Video',
    angle: 'product-demo',
    funnelStage: 'prospecting',
    buyerEmotion: 'clarity',
    creativeType: '9:16 video',
    formatBias: ['9:16', '4:5'],
    successMetric: 'hook hold, video completion, install or lead intent',
    scaleRole: 'show the user action Meta should optimize toward',
    executions: [
      {
        id: 'walkthrough',
        name: '15-Second Walkthrough',
        openingFrame: 'phone already in hand, product open, first tap visible',
        visualDirection: 'screen recording or realistic phone mockup with 3 to 5 obvious product steps',
        headline: ({ offer }) => `How to use ${offer.toLowerCase()} in seconds.`,
        primary: ({ offer }) => `Open the product, take the next action, and see why ${offer.toLowerCase()} is useful before the caption is read.`
      },
      {
        id: 'scroll-tap-save',
        name: 'Scroll, Tap, Save',
        openingFrame: 'fast movement through the list or dashboard',
        visualDirection: 'scroll through items, tap into detail, save or shortlist the important one',
        headline: ({ vocab }) => `Scroll. Tap. Save the right ${singular(vocab)}.`,
        primary: ({ outcome }) => `${sentenceCase(outcome)} Show the workflow clearly and keep the action low-friction.`
      },
      {
        id: 'no-laptop-needed',
        name: 'No Laptop Needed',
        openingFrame: 'phone in the real work environment',
        visualDirection: 'real-world setting, hand-held phone, app overlay, practical props',
        headline: () => 'No laptop needed.',
        primary: ({ offer }) => `${sentenceCase(offer)} should be available where the work actually happens.`
      },
      {
        id: 'simple-ai-or-automation',
        name: 'Explain The Smart Layer Simply',
        openingFrame: 'simple captions over the product workflow',
        visualDirection: 'screen recording plus short captions, no abstract tech visuals',
        headline: () => 'Not hype. Just a faster workflow.',
        primary: ({ proof }) => `Use the smart layer to surface ${withArticle(proof)} without pretending software replaces judgement.`
      }
    ]
  },
  {
    id: 'problem-static',
    name: 'Problem Static',
    angle: 'pain-to-relief',
    funnelStage: 'prospecting',
    buyerEmotion: 'pressure relief',
    creativeType: '4:5 static',
    formatBias: ['4:5', '9:16'],
    successMetric: 'thumb-stop rate and outbound CTR',
    scaleRole: 'make the category problem unmistakable in one frame',
    executions: [
      {
        id: 'too-many-items',
        name: 'Too Many Items',
        openingFrame: 'large stack/list/page motif',
        visualDirection: 'dense work artifact with phone or product overlay that simplifies it',
        headline: ({ vocab }) => `Too much ${vocab}. Too little time.`,
        primary: ({ offer }) => `Start with ${withArticle(offer.toLowerCase())} before the important details get buried.`
      },
      {
        id: 'shortlist-faster',
        name: 'Shortlist Faster',
        openingFrame: 'checklist or selected items',
        visualDirection: 'checklist visual plus clear product screen',
        headline: ({ vocab }) => `${sentenceCase(vocab)} faster.`,
        primary: ({ outcome }) => `${sentenceCase(outcome)} while the decision still matters.`
      },
      {
        id: 'find-the-context',
        name: 'Find The Context',
        openingFrame: 'highlight or magnifying cue over the key detail',
        visualDirection: 'highlighted detail, zoomed context, clean product proof',
        headline: () => 'The detail is there. Find it faster.',
        primary: ({ offer }) => `${sentenceCase(offer)} helps bring the useful context forward without adding another messy step.`
      },
      {
        id: 'busy-week-utility',
        name: 'Busy Week Utility',
        openingFrame: 'deadline or event pressure visual',
        visualDirection: 'event-week work surface with phone product screen and clear CTA space',
        headline: () => 'Busy week? Bring the workflow with you.',
        primary: ({ offer }) => `When the work speeds up, ${offer.toLowerCase()} needs to be one tap away.`
      }
    ]
  },
  {
    id: 'proof-authority',
    name: 'Proof And Authority',
    angle: 'expert-authority',
    funnelStage: 'warm',
    buyerEmotion: 'trust',
    creativeType: 'static or short video',
    formatBias: ['4:5', '1:1'],
    successMetric: 'signup conversion rate and qualified action rate',
    scaleRole: 'make the brand feel credible without inventing testimonials or claims',
    executions: [
      {
        id: 'built-for-market',
        name: 'Built For This Market',
        openingFrame: 'mature brand graphic plus product proof',
        visualDirection: 'professional industry imagery, product screen, restrained brand presence',
        headline: ({ audience }) => `Built for ${audience}.`,
        primary: ({ offer, audience }) => `${sentenceCase(offer)} for ${audience} who need practical tools, not generic software.`
      },
      {
        id: 'workflow-authority',
        name: 'Workflow Authority',
        openingFrame: 'simple workflow diagram',
        visualDirection: 'diagram from problem to product action to next decision',
        headline: () => 'Keep the workflow in one place.',
        primary: ({ proof }) => `Use ${withArticle(proof)} as the trust layer around the decision process.`
      },
      {
        id: 'no-gimmicks',
        name: 'No Gimmicks',
        openingFrame: 'minimal authority graphic',
        visualDirection: 'high-contrast minimal graphic with one product proof point',
        headline: () => 'No gimmicks. Just a cleaner workflow.',
        primary: ({ offer }) => `${sentenceCase(offer)} should make the next step clearer, not noisier.`
      },
      {
        id: 'serious-prep',
        name: 'For Serious Preparation',
        openingFrame: 'professional prep setting',
        visualDirection: 'desk, field, site, or client-work context with product visible',
        headline: () => 'Do the homework before the moment arrives.',
        primary: ({ audience, offer }) => `${sentenceCase(audience)} can use ${withArticle(offer.toLowerCase())} before the next decision window closes.`
      }
    ]
  },
  {
    id: 'free-tool-funnel',
    name: 'Free Tool Funnel',
    angle: 'offer',
    funnelStage: 'prospecting',
    buyerEmotion: 'low-risk trial',
    creativeType: 'static app-card or lead-magnet style',
    formatBias: ['4:5', '9:16', '1:1'],
    successMetric: 'install, lead, or signup conversion rate',
    scaleRole: 'package the offer as a valuable free utility before upsell',
    executions: [
      {
        id: 'free-tool',
        name: 'Free Tool',
        openingFrame: 'clear free label and product screen',
        visualDirection: 'app-store or lead-magnet style card with phone/product proof',
        headline: ({ offer }) => `${sentenceCase(offer)}.`,
        primary: ({ offer, proof }) => `${sentenceCase(offer)} gives you ${withArticle(proof)} without a heavy commitment.`
      },
      {
        id: 'free-guide-style',
        name: 'Free Guide Style',
        openingFrame: 'free report or free guide clarity adapted to the product',
        visualDirection: 'mature free-resource layout with product screen, not hype',
        headline: () => 'Free tool. Practical next step.',
        primary: ({ offer }) => `Start with ${withArticle(offer.toLowerCase())} and see whether it belongs in your workflow.`
      },
      {
        id: 'upgrade-later',
        name: 'Start Free, Upgrade Later',
        openingFrame: 'two-step funnel: free utility to deeper product value',
        visualDirection: 'simple funnel visual from free workflow to advanced capability',
        headline: () => 'Start free. Go deeper when ready.',
        primary: ({ offer }) => `Use ${withArticle(offer.toLowerCase())} first. Add deeper analysis only when the workflow proves useful.`
      },
      {
        id: 'send-to-peer',
        name: 'Send To A Peer',
        openingFrame: 'native share-style creative',
        visualDirection: 'phone share card or message-style layout with brand-safe product proof',
        headline: ({ audience }) => `Know ${withArticle(audience)} who needs this?`,
        primary: ({ offer }) => `Send them ${withArticle(offer.toLowerCase())} before the next busy workflow.`
      }
    ]
  },
  {
    id: 'comparison',
    name: 'Comparison',
    angle: 'comparison',
    funnelStage: 'prospecting',
    buyerEmotion: 'clarity',
    creativeType: 'static comparison',
    formatBias: ['4:5', '1:1'],
    successMetric: 'outbound CTR and qualified landing-page view quality',
    scaleRole: 'contrast the old workflow against the new product behavior',
    executions: [
      {
        id: 'manual-vs-product',
        name: 'Manual vs Product',
        openingFrame: 'two-column comparison',
        visualDirection: 'manual clutter on left, clean product workflow on right',
        headline: () => 'Manual process vs working system.',
        primary: ({ offer }) => `${sentenceCase(offer)} turns a scattered workflow into a clearer next step.`
      },
      {
        id: 'tabs-vs-context',
        name: 'Tabs vs Context',
        openingFrame: 'many tabs or scattered notes',
        visualDirection: 'tabs, notes, screenshots, and one clean product screen',
        headline: () => 'Less switching. More context.',
        primary: ({ proof }) => `Keep ${withArticle(proof)} close to the decision instead of chasing it across tools.`
      },
      {
        id: 'before-after',
        name: 'Before and After',
        openingFrame: 'before/after workflow visual',
        visualDirection: 'before: messy work; after: focused product action',
        headline: ({ vocab }) => `Before and after your next ${vocab}.`,
        primary: ({ outcome }) => `${sentenceCase(outcome)} with a workflow the audience can understand in one glance.`
      },
      {
        id: 'simple-choice',
        name: 'Simple Choice',
        openingFrame: 'one direct choice statement',
        visualDirection: 'minimal contrast graphic with product proof',
        headline: () => 'Keep guessing, or check the context.',
        primary: ({ offer }) => `${sentenceCase(offer)} gives the next decision a cleaner starting point.`
      }
    ]
  },
  {
    id: 'objection-handling',
    name: 'Objection Handling',
    angle: 'objection-handling',
    funnelStage: 'warm',
    buyerEmotion: 'trust',
    creativeType: 'static or short video',
    formatBias: ['4:5', '1:1'],
    successMetric: 'signup conversion rate and cost per qualified action',
    scaleRole: 'answer why someone should try the product despite an existing workflow',
    executions: [
      {
        id: 'already-have-process',
        name: 'Already Have A Process',
        openingFrame: 'respect the existing manual process',
        visualDirection: 'manual workflow beside product, no dismissive framing',
        headline: () => 'Already have a process? Keep it.',
        primary: ({ offer }) => `${sentenceCase(offer)} should support the way experienced people already work.`
      },
      {
        id: 'human-judgement',
        name: 'Human Judgement Stays In Charge',
        openingFrame: 'expert decision maker plus product context',
        visualDirection: 'professional using product with final decision clearly human-led',
        headline: () => 'Keep the judgement. Add the context.',
        primary: ({ proof }) => `The product organizes ${withArticle(proof)} around the decision. It does not make the decision for you.`
      },
      {
        id: 'not-another-tool',
        name: 'Not Another Tool',
        openingFrame: 'tool fatigue language',
        visualDirection: 'clean, low-friction product view with minimal copy',
        headline: () => 'Not another noisy tool.',
        primary: ({ offer }) => `${sentenceCase(offer)} earns attention by making the next step easier.`
      },
      {
        id: 'free-first',
        name: 'Try The Free Part First',
        openingFrame: 'low-risk free access',
        visualDirection: 'free-access product card with controlled CTA',
        headline: () => 'Try the useful part first.',
        primary: ({ offer, cta }) => `${sentenceCase(offer)} is the low-risk starting point. ${cta} and test it on a real workflow.`
      }
    ]
  },
  {
    id: 'native-ugc-demo',
    name: 'Native UGC Demo',
    angle: 'native-demo',
    funnelStage: 'prospecting',
    buyerEmotion: 'curiosity',
    creativeType: '9:16 native video',
    formatBias: ['9:16'],
    successMetric: 'hook hold, video completion, and click-through rate',
    scaleRole: 'make the product feel like a useful tip, not a polished corporate ad',
    executions: [
      {
        id: 'found-this-tool',
        name: 'Found This Tool',
        openingFrame: 'phone held to camera with product already open',
        visualDirection: 'native handheld demo, real environment, minimal polish',
        headline: () => 'A useful tool for the busy part of the job.',
        primary: ({ offer }) => `Show ${withArticle(offer.toLowerCase())} as a practical tip for someone already doing the work.`
      },
      {
        id: 'three-taps',
        name: 'Three Taps',
        openingFrame: 'tap sequence',
        visualDirection: 'three fast product actions with simple captions',
        headline: () => 'Three taps to a clearer next step.',
        primary: ({ outcome }) => `${sentenceCase(outcome)} without a long explanation.`
      },
      {
        id: 'real-work-setting',
        name: 'Real Work Setting',
        openingFrame: 'product used in the field',
        visualDirection: 'phone foreground, real industry setting background',
        headline: () => 'Built for the field, not just the desk.',
        primary: ({ offer }) => `${sentenceCase(offer)} needs to work where the decision happens.`
      },
      {
        id: 'quick-tip',
        name: 'Quick Tip',
        openingFrame: 'direct-to-camera style quick tip',
        visualDirection: 'UGC-style quick tip with product cutaways',
        headline: () => 'Quick tip before the next decision.',
        primary: ({ proof }) => `Use ${withArticle(proof)} to check the context before you move on.`
      }
    ]
  },
  {
    id: 'retargeting-next-action',
    name: 'Retargeting Next Action',
    angle: 'retargeting',
    funnelStage: 'retargeting',
    buyerEmotion: 'completion',
    creativeType: 'static or short video',
    formatBias: ['4:5', '1:1'],
    successMetric: 'cost per deeper event and return visit rate',
    scaleRole: 'move installers, visitors, or leads to the next meaningful product action',
    executions: [
      {
        id: 'finish-setup',
        name: 'Finish Setup',
        openingFrame: 'unfinished setup or next action cue',
        visualDirection: 'clean reminder card with product screen and next-step CTA',
        headline: () => 'Finish the setup before the next busy moment.',
        primary: ({ offer }) => `You already saw the value. Open ${withArticle(offer.toLowerCase())} and take the next step.`
      },
      {
        id: 'come-back-context',
        name: 'Come Back To The Context',
        openingFrame: 'saved item or context reminder',
        visualDirection: 'saved item, note, or progress state inside the product',
        headline: () => 'Come back to the context.',
        primary: ({ proof }) => `The useful work is in ${withArticle(proof)} you can return to later.`
      },
      {
        id: 'upgrade-when-ready',
        name: 'Upgrade When Ready',
        openingFrame: 'free workflow to advanced action',
        visualDirection: 'two-step upgrade graphic with no pressure language',
        headline: () => 'Go deeper when the workflow is ready.',
        primary: ({ offer }) => `Start with ${withArticle(offer.toLowerCase())}. Upgrade only when the next layer of context is worth it.`
      },
      {
        id: 'share-with-team',
        name: 'Share With Team',
        openingFrame: 'shared shortlist or team note',
        visualDirection: 'shared record, comment, or team handoff inside product',
        headline: () => 'Share the reasoning, not just the link.',
        primary: ({ proof }) => `Send ${withArticle(proof)} with the context that explains the decision.`
      }
    ]
  },
  {
    id: 'seasonal-urgency',
    name: 'Seasonal Urgency',
    angle: 'deadline-urgency',
    funnelStage: 'prospecting',
    buyerEmotion: 'timeliness',
    creativeType: 'static or video',
    formatBias: ['9:16', '4:5'],
    successMetric: 'click-through rate and install or lead conversion rate',
    scaleRole: 'use a real event window without fake scarcity',
    executions: [
      {
        id: 'before-event',
        name: 'Before The Event',
        openingFrame: 'calendar or deadline cue',
        visualDirection: 'event-prep context with product screen and deadline-safe copy',
        headline: () => 'Before the next event, get the workflow ready.',
        primary: ({ offer }) => `${sentenceCase(offer)} is most useful before the pressure starts.`
      },
      {
        id: 'busy-season',
        name: 'Busy Season',
        openingFrame: 'busy season work surface',
        visualDirection: 'dense schedule, notes, and product as the organizing layer',
        headline: () => 'Busy season is not the time for scattered notes.',
        primary: ({ proof }) => `Keep ${withArticle(proof)} in one place while the work speeds up.`
      },
      {
        id: 'last-minute-check',
        name: 'Last-Minute Check',
        openingFrame: 'last check before decision',
        visualDirection: 'phone close-up in the final review moment',
        headline: () => 'One last context check.',
        primary: ({ offer }) => `Use ${withArticle(offer.toLowerCase())} before the decision window closes.`
      },
      {
        id: 'start-now',
        name: 'Start Now',
        openingFrame: 'direct CTA and product proof',
        visualDirection: 'clean product card with immediate-start framing',
        headline: () => 'Start now. Learn before it gets busy.',
        primary: ({ cta, offer }) => `${cta} and test ${withArticle(offer.toLowerCase())} before the next high-pressure workflow.`
      }
    ]
  }
  ];
}

function buildBatchStrategy({ args, audience, offer, count, formats, scaleProfile, adSetStrategy }) {
  const requestedFamilies = flattenList(asArray(args['creative-family']));
  const creativeFamilies = selectCreativeFamilies({ requestedFamilies, count, scaleProfile });
  const audienceSegments = buildAudienceSegments({ args, audience, count, scaleProfile });
  const adSets = buildAdSets({ creativeFamilies, audienceSegments, adSetStrategy, audience, offer });

  return {
    version: 2,
    scaleProfile,
    adSetStrategy,
    targetVariantCount: count,
    recommendedLaunchShape: '20 ads = 5 creative families x 4 executions',
    recommendedScaleShape: '100 ads = 10 creative families x 10 executions across audience segments and placements',
    formats,
    creativeFamilies: creativeFamilies.map((family) => ({
      id: family.id,
      name: family.name,
      angle: family.angle,
      funnelStage: family.funnelStage,
      buyerEmotion: family.buyerEmotion,
      creativeType: family.creativeType,
      formatBias: family.formatBias,
      successMetric: family.successMetric,
      scaleRole: family.scaleRole,
      executions: family.executions.map(({ id, name, openingFrame, visualDirection }) => ({
        id,
        name,
        openingFrame,
        visualDirection
      }))
    })),
    audienceSegments,
    adSets,
    scalingRules: [
      'Do not make 100 unrelated ads; scale by family, execution, format, audience segment, and hook variation.',
      'Keep broad prospecting consolidated unless there is enough conversion volume to justify segmentation.',
      'Use 9:16 first for video/native demo ideas, then adapt winners to 4:5 and 1:1.',
      'Every ad should sell one job, one proof point, and one action.',
      'Draft-only output requires human review before any Meta account action.'
    ]
  };
}

function selectCreativeFamilies({ requestedFamilies, count, scaleProfile }) {
  if (requestedFamilies.length > 0) {
    const requested = requestedFamilies.map(slugify);
    const selected = requested.map((id) => {
      const match = familyBlueprints().find((family) => family.id === id);
      if (!match) {
        fail(`unknown --creative-family "${id}". Valid values: ${familyBlueprints().map((family) => family.id).join(', ')}`);
      }
      return match;
    });
    return dedupeById(selected);
  }

  const blueprints = familyBlueprints();
  const targetFamilyCount = scaleProfile === 'scale-100' || count >= 80 ? 10 : Math.min(5, blueprints.length);
  return blueprints.slice(0, targetFamilyCount);
}

function buildAudienceSegments({ args, audience, count, scaleProfile }) {
  const supplied = flattenList(asArray(args['audience-segment']));

  if (supplied.length > 0) {
    return supplied.map((name, index) => ({
      id: slugify(name),
      name,
      funnelStage: index === 0 ? 'prospecting' : 'warm',
      targetingNotes: `User-supplied segment for ${audience}. Keep exact targeting human-reviewed before launch.`
    }));
  }

  const segments = [
    {
      id: 'broad-core-market',
      name: 'Broad Core Market',
      funnelStage: 'prospecting',
      targetingNotes: `Broad ${audience}; use creative to qualify interest before narrowing.`
    }
  ];

  if (scaleProfile === 'scale-100' || count >= 80) {
    segments.push({
      id: 'warm-engagers',
      name: 'Warm Engagers',
      funnelStage: 'warm',
      targetingNotes: 'Retarget site visitors, video viewers, leads, installers, or engaged social users when compliant and available.'
    });
  }

  return segments;
}

function buildAdSets({ creativeFamilies, audienceSegments, adSetStrategy, audience, offer }) {
  if (adSetStrategy === 'consolidated') {
    return uniqueBy(
      audienceSegments.map((segment) => ({
        id: `${segment.id}-${segment.funnelStage}`,
        name: `${titleCase(segment.name)} - ${titleCase(segment.funnelStage)}`,
        strategy: adSetStrategy,
        familyId: null,
        familyName: null,
        audienceSegmentId: segment.id,
        audienceSegmentName: segment.name,
        funnelStage: segment.funnelStage,
        optimizationEvent: optimizationEventFor(segment.funnelStage, offer),
        placements: 'Advantage+ placements with 9:16, 4:5, and 1:1 assets available',
        targetingNotes: segment.targetingNotes
      })),
      'id'
    );
  }

  const families = creativeFamilies;
  const segments = adSetStrategy === 'family-segment' ? audienceSegments : [audienceSegments[0]];
  const adSets = [];

  for (const family of families) {
    for (const segment of segments) {
      const funnelStage = family.funnelStage === 'retargeting' ? 'retargeting' : segment.funnelStage;
      adSets.push({
        id: `${family.id}-${segment.id}`,
        name: `${titleCase(family.name)} - ${titleCase(segment.name)}`,
        strategy: adSetStrategy,
        familyId: family.id,
        familyName: family.name,
        audienceSegmentId: segment.id,
        audienceSegmentName: segment.name,
        funnelStage,
        optimizationEvent: optimizationEventFor(funnelStage, offer),
        placements: placementFor(family),
        targetingNotes:
          funnelStage === 'prospecting'
            ? `Broad ${audience}; let this ${family.name.toLowerCase()} creative family qualify the buyer.`
            : segment.targetingNotes
      });
    }
  }

  return adSets;
}

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

function buildConcepts({ audience, offer, cta, landingPage, insights, batchStrategy }) {
  return batchStrategy.creativeFamilies.map((family, index) => {
    const pain = pick(insights.copyStrategy.painPoints, index);
    const outcome = pick(insights.copyStrategy.desiredOutcomes, index);
    const proof = pick(insights.copyStrategy.proofPoints, index);

    return {
      id: family.id,
      name: family.name,
      familyId: family.id,
      angle: family.angle,
      audience,
      funnelStage: family.funnelStage,
      buyerEmotion: family.buyerEmotion,
      creativeType: family.creativeType,
      formatBias: family.formatBias,
      scaleRole: family.scaleRole,
      hook: sentenceCase(outcome),
      proof,
      offer,
      cta,
      landingPage,
      researchHypothesis: pain,
      successMetric: family.successMetric,
      executions: familyBlueprints().find((blueprint) => blueprint.id === family.id)?.executions ?? []
    };
  });
}

function buildVariants({ brand, audience, offer, cta, landingPage, formats, count, concepts, insights, batchStrategy }) {
  const variants = [];
  let index = 0;

  while (variants.length < count) {
    const concept = concepts[index % concepts.length];
    const familyRound = Math.floor(index / concepts.length);
    const execution = pick(concept.executions, familyRound);
    const format = pickFormat({ formats, concept, index: familyRound });
    const adSet = pickAdSetForConcept({ concept, batchStrategy, index: familyRound });
    const vocab = pick(insights.copyStrategy.vocabulary, index);
    const pain = pick(insights.copyStrategy.painPoints, index);
    const outcome = pick(insights.copyStrategy.desiredOutcomes, index);
    const proof = pick(insights.copyStrategy.proofPoints, index);
    const objection = pick(insights.copyStrategy.objections, index);
    const action = actionFor(concept.angle, brand.name, offer, cta);
    const copyContext = {
      brand,
      audience,
      offer,
      cta,
      pain,
      outcome,
      proof,
      objection,
      action,
      vocab
    };
    const headline = execution?.headline ? execution.headline(copyContext) : sentenceCase(outcome);
    const primaryText = execution?.primary
      ? execution.primary(copyContext)
      : `${sentence(pain)} ${action}`;

    variants.push({
      id: `${String(index + 1).padStart(3, '0')}-${concept.id}-${execution?.id ?? 'variant'}-${format.replace(':', 'x')}`,
      conceptId: concept.id,
      conceptName: concept.name,
      familyId: concept.familyId,
      familyName: concept.name,
      executionId: execution?.id ?? 'variant',
      executionName: execution?.name ?? 'Variant',
      adSetId: adSet.id,
      adSetName: adSet.name,
      adSetStrategy: adSet.strategy,
      audienceSegment: adSet.audienceSegmentName,
      angle: concept.angle,
      funnelStage: adSet.funnelStage,
      creativeType: concept.creativeType,
      openingFrame: execution?.openingFrame ?? 'show the product in the buyer moment',
      visualDirection: execution?.visualDirection ?? 'brand-relevant product proof in a real work setting',
      audience,
      format,
      offer,
      cta,
      headline: trimTo(headline, 72),
      primaryText: trimTo(primaryText, 240),
      description: trimTo(`${brand.name} helps ${audience} keep the work organised before the next decision.`, 120),
      landingPage: withUtm(landingPage, {
        utm_source: 'meta',
        utm_medium: 'paid_social',
        utm_campaign: `${slugify(brand.name)}_${batchStrategy.scaleProfile}_creative`,
        utm_content: `${concept.id}_${execution?.id ?? 'variant'}_${format.replace(':', 'x')}`,
        utm_term: slugify(adSet.audienceSegmentName)
      }),
      researchHypothesis: concept.researchHypothesis,
      successMetric: concept.successMetric,
      optimizationEvent: adSet.optimizationEvent,
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
    family: variant.familyName,
    execution: variant.executionName,
    adSet: variant.adSetName,
    placement: 'Meta feed/story/reels creative',
    aspectRatio: variant.format,
    creativeType: variant.creativeType,
    provider: 'runtime-selected',
    model: 'runtime-selected',
    prompt: [
      `Create a Meta ad visual for ${variant.audience} promoting ${variant.offer}.`,
      `Creative family: ${variant.familyName}; execution: ${variant.executionName}.`,
      `Opening frame: ${variant.openingFrame}.`,
      `Scene: ${variant.visualDirection}.`,
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
    productionNotes: {
      openingFrame: variant.openingFrame,
      visualDirection: variant.visualDirection,
      creativeType: variant.creativeType,
      targetAdSet: variant.adSetName,
      optimizationEvent: variant.optimizationEvent
    },
    outputFilename: `${variant.id}.png`,
    reviewNotes: [
      'Add brand/logo/text in controlled layout after image generation.',
      'Reject if the visual makes the product unclear or introduces unsupported claims.'
    ]
  };
}

function buildMetaDraftPlan({ brand, audience, offer, cta, variants, publishMode, batchStrategy }) {
  const adsByAdSet = groupBy(variants, 'adSetId');

  return {
    version: 2,
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
      cta,
      scaleProfile: batchStrategy.scaleProfile,
      adSetStrategy: batchStrategy.adSetStrategy
    },
    adSets: batchStrategy.adSets.map((adSet) => ({
      draftName: `${brand.name} - ${adSet.name} - Draft`,
      adSetId: adSet.id,
      strategy: adSet.strategy,
      familyId: adSet.familyId,
      familyName: adSet.familyName,
      audienceSegment: adSet.audienceSegmentName,
      funnelStage: adSet.funnelStage,
      optimizationEvent: adSet.optimizationEvent,
      placements: adSet.placements,
      targetingNotes: adSet.targetingNotes,
      ads: (adsByAdSet.get(adSet.id) ?? []).map((variant) => variant.id),
      status: 'draft_pending_human_review'
    })),
    ads: variants.map((variant) => ({
      draftName: `${brand.name} - ${variant.id}`,
      creativeId: variant.id,
      adSetId: variant.adSetId,
      adSetName: variant.adSetName,
      familyId: variant.familyId,
      familyName: variant.familyName,
      executionId: variant.executionId,
      creativeType: variant.creativeType,
      format: variant.format,
      headline: variant.headline,
      primaryText: variant.primaryText,
      description: variant.description,
      cta: variant.cta,
      landingPage: variant.landingPage,
      optimizationEvent: variant.optimizationEvent,
      status: 'draft_pending_human_review'
    }))
  };
}

function buildApprovalPack({
  brand,
  audience,
  offer,
  cta,
  landingPage,
  researchPlan,
  insights,
  concepts,
  variants,
  batchStrategy,
  prompts,
  publishMode
}) {
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
- Scale profile: ${batchStrategy.scaleProfile}
- Ad-set strategy: ${batchStrategy.adSetStrategy}

## Scale Plan

- Launch shape: ${batchStrategy.recommendedLaunchShape}
- Scale shape: ${batchStrategy.recommendedScaleShape}
- Creative families: ${batchStrategy.creativeFamilies.length}
- Audience segments: ${batchStrategy.audienceSegments.length}
- Draft ad sets: ${batchStrategy.adSets.length}

Creative families:
${batchStrategy.creativeFamilies
  .map((family) => `- ${family.name}: ${family.scaleRole}`)
  .join('\n')}

Draft ad sets:
${batchStrategy.adSets
  .map((adSet) => `- ${adSet.name}: ${adSet.optimizationEvent}; ${adSet.targetingNotes}`)
  .join('\n')}

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
- Creative type: ${concept.creativeType}
- Hook: ${concept.hook}
- Proof: ${concept.proof}
- Research hypothesis: ${concept.researchHypothesis}
- Success metric: ${concept.successMetric}
- Approval status: draft only - requires human review`
  )
  .join('\n\n')}

## Variant Preview

${variants
  .map(
    (variant) => `### ${variant.id}

- Ad set: ${variant.adSetName}
- Concept: ${variant.conceptName}
- Family/execution: ${variant.familyName} / ${variant.executionName}
- Creative type: ${variant.creativeType}
- Format: ${variant.format}
- Headline: ${variant.headline}
- Primary text: ${variant.primaryText}
- Opening frame: ${variant.openingFrame}
- CTA: ${variant.cta}
- Landing page: ${variant.landingPage}
- Success metric: ${variant.successMetric}
- Optimization event: ${variant.optimizationEvent}
- Approval status: ${variant.approvalStatus}`
  )
  .join('\n\n')}

## Asset Prompt Files

The model prompt manifest is written to \`asset-prompts.jsonl\`.

Prompt records: ${prompts.length}

## Meta Draft Plan

The draft-only Meta import plan is written to \`meta-draft-plan.json\`.
The scale and ad-set plan is written to \`scale-plan.json\`.

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
    'adSetName',
    'audienceSegment',
    'familyName',
    'executionName',
    'conceptName',
    'angle',
    'funnelStage',
    'creativeType',
    'audience',
    'format',
    'headline',
    'primaryText',
    'description',
    'cta',
    'landingPage',
    'openingFrame',
    'visualDirection',
    'researchHypothesis',
    'successMetric',
    'optimizationEvent',
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

function inferScaleProfile(count) {
  return count >= 80 ? 'scale-100' : 'launch-test';
}

function inferAdSetStrategy(count) {
  return count >= 80 ? 'family-segment' : 'family';
}

function parseChoice(value, name, choices) {
  if (!choices.includes(value)) {
    fail(`--${name} must be one of: ${choices.join(', ')}`);
  }
  return value;
}

function pickFormat({ formats, concept, index }) {
  const preferred = concept.formatBias.find((format) => formats.includes(format));
  if (preferred && index % 2 === 0) return preferred;
  return formats[index % formats.length];
}

function pickAdSetForConcept({ concept, batchStrategy, index }) {
  const matching = batchStrategy.adSets.filter((adSet) => {
    if (adSet.familyId && adSet.familyId !== concept.familyId) return false;
    if (!adSet.familyId && adSet.funnelStage !== concept.funnelStage && concept.funnelStage !== 'prospecting') return false;
    return true;
  });

  if (matching.length > 0) {
    return matching[index % matching.length];
  }

  return batchStrategy.adSets[index % batchStrategy.adSets.length];
}

function optimizationEventFor(funnelStage, offer) {
  if (funnelStage === 'retargeting') {
    return 'deeper_product_action_to_be_confirmed';
  }
  if (funnelStage === 'warm') {
    return 'signup_or_lead_conversion_to_be_confirmed';
  }
  if (/app|ios|android|mobile/i.test(offer)) {
    return 'install_then_upgrade_to_in_app_event';
  }
  return 'landing_page_view_then_lead_or_signup';
}

function placementFor(family) {
  if (family.creativeType.includes('9:16') || family.formatBias.includes('9:16')) {
    return 'Advantage+ placements with 9:16 story/reels assets prioritized';
  }
  return 'Advantage+ placements with 4:5 feed and 1:1 square variants available';
}

function flattenList(values) {
  return values.flatMap((value) => splitList(value));
}

function dedupeById(items) {
  return uniqueBy(items, 'id');
}

function uniqueBy(items, key) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const value = item[key];
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(item);
  }

  return unique;
}

function groupBy(items, key) {
  const groups = new Map();

  for (const item of items) {
    const value = item[key];
    if (!groups.has(value)) {
      groups.set(value, []);
    }
    groups.get(value).push(item);
  }

  return groups;
}

function titleCase(value) {
  return String(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function verbFor(value) {
  const text = String(value ?? '').toLowerCase();
  if (text.endsWith('list')) return 'build the list';
  if (text.endsWith('workflow')) return 'start the workflow';
  if (text.endsWith('review')) return 'start the review';
  return `start the ${text}`;
}

function singular(value) {
  const text = String(value ?? '').trim();
  if (text.endsWith('ies')) return `${text.slice(0, -3)}y`;
  if (text.endsWith('s') && text.length > 3) return text.slice(0, -1);
  return text;
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
  --cta, --count, --formats, --landing-page, --publish-mode, --out-dir,
  --scale-profile, --ad-set-strategy, --creative-family, --audience-segment

Scale fields:
  --scale-profile launch-test|scale-100|custom
  --ad-set-strategy consolidated|family|family-segment
  --creative-family native-text-story|phone-demo-video|problem-static|proof-authority|free-tool-funnel|comparison|objection-handling|native-ugc-demo|retargeting-next-action|seasonal-urgency
  --audience-segment "Broad Core Market" --audience-segment "Warm Engagers"

Notes:
  This CLI is export-only. It writes a research plan, insight brief, copy matrix,
  scale plan, image prompt manifest, approval pack, and Meta draft plan. It does
  not call Meta, Perplexity, Reddit, YouTube, or an image provider directly.
`);
}

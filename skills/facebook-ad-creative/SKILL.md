---
name: facebook-ad-creative
description: Research Meta/Facebook ads, develop high-performing ad concepts, generate asset prompts, prepare safe draft ads, and report performance.
---

# Facebook Ad Creative

Use this skill when asked to make, research, brief, generate, draft, or report on
Meta/Facebook ad creative.

## Operating Mode

Think like a senior Facebook performance marketer:

- research before ideating,
- identify why an ad might be working,
- create original concepts instead of copying,
- match the creative to funnel stage and buyer psychology,
- make the next test obvious,
- protect spend and brand trust with approval gates.

## Runtime Contract

When installed through CrewCMD/OpenClaw, read assignment policy from
`skills.entries.facebook-ad-creative.config` or the runtime's equivalent skill
config surface. The companion `skill.json` defines the UI schema.

Expected vault-backed environment variables:

- `FAL_KEY` for fal.ai asset generation,
- `ADS_LIBRARY_API_KEY` for optional hosted Ads Library research,
- `META_ACCESS_TOKEN` and `META_AD_ACCOUNT_ID` for optional ad ops/reporting.

Higgsfield's hosted MCP uses connector/account authentication; use
`higgsfieldEnabled` as a policy flag when the runtime exposes that connector.

If `canCreatePausedAds`, `canPublishAds`, or `canChangeBudget` are absent, treat
them as `false`.

## Safety Gates

Never publish ads, increase budget, edit live ads, delete ad-account objects, or
change audiences/pixels/billing without explicit human approval.

Default to:

- research-only,
- asset generation,
- approval packs,
- draft-only or paused ad creation when explicitly requested,
- read-only reporting.

## Workflow

1. Clarify or infer the brief: product, audience, offer, market, conversion,
   landing page, exclusions, and brand constraints.
2. Research 10 to 30 active or recent ads. For research tactics, read
   `references/research.md`.
3. Extract patterns: hook, proof, offer, visual language, CTA, funnel stage, and
   likely buyer psychology.
4. Build 5 to 10 original concepts. For angle selection, read
   `references/creative-strategy.md`.
5. Prepare asset prompts and generation instructions. For model/tool guidance,
   read `references/asset-generation.md`.
6. Produce an approval pack before any ad-account action.
7. If ad ops is requested, create only approved drafts or paused ads unless the
   user explicitly approves publishing.
8. If performance reporting is requested, read `references/reporting.md`.

## Output Standards

For creative batches, include:

- concepts,
- rationale,
- hook variants,
- primary text,
- headlines,
- visual prompt,
- format,
- CTA,
- landing page/UTM note,
- approval status.

For reports, lead with:

- what ran,
- what spent,
- what won,
- what lost,
- what to do next.

Avoid unsupported claims, guaranteed outcomes, competitor copying, and vague
"high-converting" language with no hypothesis.

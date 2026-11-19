---
name: facebook-ad-creative
description: Research Meta/Facebook ads, develop ad concepts, render creative, set up and run app install campaigns on Facebook and Instagram, monitor them, and find the winning and losing ads.
---

# Facebook Ad Creative

Use this skill when asked to make, research, brief, generate, draft, or report on
Meta/Facebook ad creative, or to set up, run, monitor or score an app install
campaign on Facebook and Instagram.

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
- `APIFY_TOKEN` for Ad Library research with `npm run research:ads`, and
  `APIFY_MAX_USD` for the owner's per-run spend ceiling (default 5),
- `ADS_LIBRARY_API_KEY` for another hosted Ads Library provider,
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

Each step has one job, one input and one output. Route every request to the
step it needs, and ask first whether it is worth doing: a request with no data
goes to research first; a request to scale with under 3 days of data stops.

1. **Brief.** Read or draft `brand-brief.md` in the working folder. See
   `references/brand-brief.md`. Unknowns are `[ASK]`; missing proof is
   `[PROOF NEEDED]`.
2. **Research.** Pull and rank competitors' live ads (`research:ads`, then
   `research:board`), or capture them by hand. Show the cost estimate and get a
   yes before any paid pull. Read `references/research.md`.
3. **Angles.** Pick 3 angles for this round (who, problem, proof, offer).
   Read `references/creative-strategy.md`.
4. **Hooks and copy.** For cold audiences, fill the 17-question copy brief
   first and size each concept's bets; read `references/copy-brief.md`. Then
   about 50 hooks per angle across six types, top 5 marked, and write from a
   long-running reference ad's structure. Run `creative:overlap` against the
   research board.
5. **Assets.** Static briefs and short video scripts, then render
   (`creative:render`, `creative:package`) or generate with an approved spend
   cap. Read `references/asset-generation.md`.
6. **Pre-launch check.** PASS/FIX each ad against the checklist in
   `references/creative-strategy.md` and `references/compliance.md`.
7. **Approval pack.** Ad sets, names, copy, budget maths, dates, all marked
   `NEEDS APPROVAL`.
8. **Build paused.** Only on approval, create drafts or paused ads through the
   Meta ads MCP server or `creative:upload`. The human activates.
9. **Read results.** Day 1 delivery, day 3 cuts, day 7 scale, weekly report,
   checked against the backend. Read `references/reporting.md`.

## App Install Campaigns

When the goal is installs of a mobile app, read
`references/app-install-campaigns.md` before doing anything else. It covers the
setup checks, the campaign shape, building paused campaigns with the Meta ads
MCP server or the `meta` CLI, daily monitoring, and scoring winners and losers.
The step-by-step guides for the human are `docs/app-install-setup.md` and
`docs/running-app-install-ads.md`.

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

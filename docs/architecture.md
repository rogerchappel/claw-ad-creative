# Architecture

The safest setup is two separate agents with different permissions.

## Creative Intelligence Agent

Purpose: find winning patterns and make assets.

Recommended tools:

- Ads Library research MCP or browser-backed Ads Library access.
- fal.ai MCP for image and video generation.
- Optional Higgsfield MCP for high-polish short-form video.
- Web research and local file write access for reports and prompt packs.

Do not give this agent Meta Ads account write access.

Outputs:

- competitor ad swipe file,
- hook and angle analysis,
- creative brief,
- static asset prompts,
- video prompts,
- generated asset inventory,
- recommended tests.

## Ad Ops And Reporting Agent

Purpose: create approved drafts and report performance.

Recommended tools:

- Meta Ads MCP or Marketing API connector,
- read access to campaigns, ads, insights, and creatives,
- draft creation access only when supported,
- no publish or budget-change permission without a human approval gate.

Allowed by default:

- read campaign performance,
- create reports,
- prepare draft campaign/ad structures,
- create paused ads when explicitly requested.

Requires explicit human approval:

- publish an ad,
- turn on a campaign, ad set, or ad,
- increase budget,
- alter live targeting,
- edit live creative,
- delete or archive anything,
- create or edit custom audiences,
- change pixels, attribution settings, domains, or billing.

## Handoff Contract

The creative agent should hand the ad ops agent a reviewable batch:

- campaign objective,
- audience hypothesis,
- placements,
- creative files,
- primary text variants,
- headline variants,
- descriptions,
- CTA,
- landing page,
- UTM plan,
- budget proposal,
- stop conditions,
- reporting window.

The ad ops agent should reply with:

- what it created,
- what remains paused or draft-only,
- what it did not touch,
- links or IDs,
- next approval needed.

## Safety Principle

An ad agent can spend real money and damage a brand quickly. Keep creative
generation, draft creation, publishing, and reporting as separate steps with
human approval between them.

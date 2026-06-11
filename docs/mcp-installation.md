# MCP Installation Notes

This project does not ship or endorse a single MCP server. It documents the
recommended roles and permission boundaries so teams can choose the best current
connector for their runtime.

## Competitor Research

Use a read-only Ads Library workflow.

Good options:

- a Facebook Ads Library MCP that searches public Ads Library pages,
- an Apify-backed Ads Library actor MCP,
- a ScrapeCreators-style Ads Library provider,
- browser automation against the public Ads Library UI.

Prefer read-only access. Competitor research should not require access to your
Meta ad account.

Research targets:

- direct competitors,
- adjacent tools,
- aspirational products with similar buyer psychology,
- marketplaces,
- premium data products,
- industry events and auctions,
- consultants or agents selling comparable outcomes.

## Asset Generation

Use fal.ai for broad model access and iteration:

- model discovery,
- schema inspection,
- price checks,
- prompt-to-image,
- image-to-image,
- video generation,
- upload support.

Expected secret:

```sh
FAL_KEY=...
```

When running through CrewCMD/OpenClaw, store this as a vault secret and expose it
through the skill assignment config rather than committing it to a local env
file. See `docs/crewcmd-installation.md`.

Use Higgsfield when the campaign needs polished short-form video or realistic
UGC-style motion. Higgsfield's hosted MCP is URL/account-auth based; connect the
server and sign in through the MCP client.

## Meta Ads Account Actions

Meta Ads MCP or Marketing API access belongs in the ad ops/reporting agent, not
the creative research agent.

Start with read-only reporting. Add draft/paused ad creation after the team is
comfortable with approval gates.

Recommended defaults:

- read insights,
- read campaigns/ad sets/ads,
- read creatives,
- create drafts or paused ads only,
- no publish,
- no budget increase,
- no deletion.

## OpenClaw Scoping Example

Expose only the creative tools to the creative agent:

```text
agent: pixel
tools:
  - ads-library.search
  - ads-library.fetch
  - fal.models
  - fal.run
  - higgsfield.generate
  - file.write
  - web.search
blocked:
  - meta.ads.publish
  - meta.ads.budget.update
  - meta.ads.campaign.delete
```

Expose read/reporting tools to the ad ops agent first:

```text
agent: media-buyer
tools:
  - meta.ads.insights.read
  - meta.ads.campaigns.read
  - meta.ads.creatives.read
  - file.write
requires_approval:
  - meta.ads.ad.create
  - meta.ads.campaign.create
  - meta.ads.publish
  - meta.ads.budget.update
```

Use your runtime's real tool names. The names above are illustrative.

## Setup Script

This repo includes a conservative helper script:

```sh
bash scripts/install-mcps.sh check
bash scripts/install-mcps.sh print-config
```

It checks local prerequisites and prints starter config snippets. It does not
write secrets or mutate runtime config automatically.

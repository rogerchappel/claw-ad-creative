# claw-ad-creative

Open agent playbook for researching Meta ads, generating ad assets, and safely
turning approved creative into draft campaigns and performance reports.

The repository is intentionally docs-first. It helps teams wire an agentic ad
creative workflow without giving the agent uncontrolled access to an ad account
or budget.

## What It Covers

- Competitor research with Meta/Facebook Ads Library data.
- Creative strategy from the perspective of a Facebook performance marketer.
- Static and video asset generation with tools such as fal.ai and Higgsfield.
- Approval gates before campaign creation, publishing, spend changes, or edits
  to live ads.
- Reporting loops for spend, CTR, CPC, CPM, conversion rate, winners, losers,
  and next tests.
- A reusable Codex/OpenClaw skill in `skills/facebook-ad-creative`.
- CrewCMD/OpenClaw library metadata, config schema, and vault-first setup
  instructions.

## Recommended Agent Stack

Start with a creative intelligence agent that can research and generate assets:

- Read-only Ads Library MCP or browser-backed Ads Library workflow.
- fal.ai MCP for image/video model discovery, schemas, pricing, and inference.
- Optional Higgsfield MCP for polished short-form video concepts.
- No Meta Ads write access in the creative agent.

Add an ad ops/reporting agent later:

- Meta Ads MCP or Marketing API access.
- Draft-only creation by default.
- Read access for performance reporting.
- Explicit human approval before publish, budget changes, live edits, or
  campaign deletion.

See `docs/architecture.md` and `docs/mcp-installation.md`.

## Skill

The included skill is designed to be copied or packaged into an agent runtime:

```text
skills/facebook-ad-creative/
```

It tells an agent how to:

- research active competitor ads,
- extract hooks and creative patterns,
- build platform-native ad concepts,
- generate image/video prompt packs,
- produce approval-ready creative batches,
- create draft-only ad plans, and
- report campaign performance clearly.

The skill keeps `SKILL.md` lean and stores deeper guidance in `references/`.
`skills/facebook-ad-creative/skill.json` adds the CrewCMD-style install
metadata and config schema so vault-backed secret references can be collected in
the UI instead of pasted into prompts or config files.

For installable setup details, see `docs/crewcmd-installation.md`.

## Install Setup

Check local prerequisites:

```sh
bash scripts/install-mcps.sh check
```

Print starter OpenClaw and CrewCMD config snippets:

```sh
bash scripts/install-mcps.sh print-config
```

Required vault secret for asset generation:

- `fal-api-key` exposed as `FAL_KEY`

Optional vault secrets:

- `ads-library-api-key` for a hosted Ads Library provider
- Higgsfield connector/account auth for premium video generation
- `meta-ads-access-token` and `meta-ad-account-id` for ad ops/reporting

## Safety Defaults

Agents using this workflow should never:

- publish ads without explicit human approval,
- increase spend or budget without approval,
- edit live ads without approval,
- delete campaigns, ad sets, ads, pixels, audiences, or assets,
- impersonate a brand or competitor,
- scrape private data,
- make unsupported performance claims.

## Verify

Run the local validation script before opening a pull request:

```sh
bash scripts/validate.sh
```

## Repository Map

- `docs/architecture.md` - two-agent model and safety boundaries.
- `docs/crewcmd-installation.md` - installable skill, vault, and MCP setup.
- `docs/mcp-installation.md` - MCP choices, credential notes, and scope.
- `docs/workflow.md` - end-to-end research, asset, approval, launch, report loop.
- `docs/report-template.md` - concise performance report format.
- `examples/catalogue-viewer-brief.md` - example brief for a horse catalogue app.
- `examples/openclaw-agent-config.md` - example runtime/tool scoping notes.
- `skills/facebook-ad-creative/` - reusable agent skill.
- `manifest.json` - package-level skill library metadata.

## License

MIT

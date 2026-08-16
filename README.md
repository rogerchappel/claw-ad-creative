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
npm ci
bash scripts/validate.sh
npm test
npm run package:smoke
npm run release:check
```

`package:smoke` runs a dry-run package build and confirms the docs, examples,
bundled skill files, setup scripts, README, and license are present in the
tarball. `release:check` combines the documentation checks, committed test
suite, and package smoke used by CI.

## Bulk Creative Batches

Generate a research-first creative batch scaffold with headline variants,
primary text, image prompts, an approval pack, and a draft-only Meta import
plan:

```sh
npm run creative:batch -- \
  --brand "Thoroughbreds.ai" \
  --brand-url "https://www.thoroughbreds.ai" \
  --audience "bloodstock agents" \
  --offer "Free iOS catalogue viewer" \
  --cta "Install Free" \
  --count 40 \
  --formats "9:16,4:5,1:1" \
  --scale-profile launch-test \
  --ad-set-strategy family \
  --primary "#28564a" \
  --accent "#1f7a4f" \
  --publish-mode drafts-only \
  --out-dir output/ad-batches/thoroughbreds-ai
```

The command writes:

- `research-plan.json` - sources, queries, and capture fields for Ads Library,
  Reddit/forums, YouTube/comments, owned pages, and adjacent products.
- `insight-brief.json` - pain points, outcomes, objections, proof points, and
  headline/body copy rules.
- `scale-plan.json` - creative families, audience segments, ad-set strategy,
  creative styles, scaling rules, and draft ad-set structure.
- `copy-matrix.csv` - headline, primary text, CTA, UTM, funnel stage, and
  success metric per variant, including creative family, execution, ad set,
  creative style, opening frame, visual direction, and optimization event.
- `selection-sheet.csv` - a simple human review sheet for marking keep,
  reject, or test candidates from larger creative batches.
- `asset-prompts.jsonl` - image prompt records for the runtime-selected model
  provider.
- `approval-pack.md` - human review pack before any ad account action.
- `meta-draft-plan.json` - draft-only ad records, with publish/budget changes
  explicitly out of scope.

The default launch shape is strategy-first rather than random volume:

- `--count` accepts positive whole numbers only; values such as `2oops`, `0`,
  and decimals are rejected.
- `--formats` accepts a comma-separated list with at least one non-empty
  format value, such as `9:16` or `9:16,4:5,1:1`.
- `--scale-profile launch-test --count 20` uses five creative families with
  four executions each and rotates through five default creative styles.
- `--scale-profile scale-100 --count 100` expands to ten creative families
  across audience segments, placement-biased formats, and the full style pool.
- `--ad-set-strategy family` creates one draft ad set per creative family.
- `--ad-set-strategy family-segment` creates family x audience-segment draft
  ad sets, which is useful for larger 100-ad planning packs.
- `--ad-set-strategy consolidated` keeps ad sets grouped by funnel stage when
  you want Meta delivery to do more of the learning.

The built-in creative families are industry-agnostic: native text-story,
phone-demo video, problem static, proof/authority, free-tool funnel,
comparison, objection handling, native UGC demo, retargeting next-action, and
seasonal urgency. Use repeated `--creative-family` flags to constrain a test.

Creative styles are separate from creative families. This lets the same angle
appear as a polished product ad, native long-copy note, field note, text-message
thread, low-polish checklist, raw screenshot, problem post, contrarian take,
operator memo, comment reply, camera-roll dump, mini lesson, founder build log,
or short-form video storyboard. Use repeated `--creative-style` flags to
constrain a batch:

```sh
npm run creative:batch -- \
  --brand "Example" \
  --brand-url "https://example.com" \
  --audience "operations managers" \
  --offer "Mobile workflow app" \
  --count 100 \
  --scale-profile scale-100 \
  --creative-style wall-of-text \
  --creative-style raw-screenshot \
  --creative-style comment-reply \
  --publish-mode drafts-only
```

You can feed in better headline and body-copy research with repeated flags:

```sh
npm run creative:batch -- \
  --brand "Example" \
  --brand-url "https://example.com" \
  --audience "operations managers" \
  --offer "Mobile workflow app" \
  --pain-point "Teams lose decisions across chats and spreadsheets" \
  --outcome "Get to a clean working list before the next meeting" \
  --objection "The team already has a manual process" \
  --proof "free mobile workflow" \
  --vocabulary "shortlist" \
  --research-note ./research-notes.md
```

Research note files may include labelled lines such as `Pain: ...`,
`Outcome: ...`, `Objection: ...`, `Proof: ...`, and `Vocabulary: ...`.

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

## Local Verification

Run the committed test suite before publishing changes:

```sh
npm test
```

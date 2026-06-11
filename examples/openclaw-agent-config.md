# Example OpenClaw Agent Notes

These examples are descriptive, not a drop-in config. Use your runtime's real
tool names and secret handling.

## Creative Agent

Name: `pixel`

Role: research ads, generate creative briefs, produce asset prompts, generate
assets, and write approval packs.

Tools:

- Ads Library search/fetch
- web search
- fal model and inference tools
- Higgsfield generation tools
- local file write

Blocked:

- Meta Ads publish
- budget changes
- live ad edits
- ad deletion
- audience creation

## Ad Ops Agent

Name: `media-buyer`

Role: create approved paused drafts and report performance.

Tools:

- Meta Ads read
- Meta Ads insights
- Meta Ads draft or paused create
- local file write

Approval required:

- publish,
- budget change,
- live edit,
- delete,
- targeting expansion,
- pixel/domain/billing change.

## Reporting Cadence

Use an isolated scheduled job for reporting when campaigns are live:

- daily during launch,
- every 2 to 3 days during learning,
- weekly after stable performance.

The report should include what changed, what spent, what won, what lost, and the
recommended next action.

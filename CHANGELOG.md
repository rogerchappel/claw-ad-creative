# Changelog

## Unreleased

- Added `research:ads` to pull live competitor ads from the public Meta Ad
  Library through Apify, behind a cost estimate, a per-run cap and an
  owner-set ceiling.
- Added `research:board` to rank competitor ads by days running, merge copies,
  and flag long runners that have stopped since the last board.
- Added `creative:overlap` to catch copy that repeats competitor wording.
- Added brand brief, compliance, hook, format, pre-launch and day 1/3/7 read
  guidance to the skill, and routed its workflow through them.
- Added app install guides (Meta and iOS setup, running and scoring campaigns),
  an agent playbook for them, and `creative:upload` to build paused campaigns
  with the Meta Ads CLI.
- Added CrewCMD/OpenClaw installable skill metadata.
- Added vault-backed config schema for fal.ai, Ads Library, Higgsfield, and
  optional Meta Ads credentials.
- Added conservative MCP setup/check scripts and generated config snippets.
- Documented CrewCMD installation and cross-platform setup for macOS, Linux,
  and WSL.
- Added the initial docs-first ad creative workflow.
- Added MCP installation and permission scoping notes.
- Added the reusable `facebook-ad-creative` skill.
- Added an example Catalogue Viewer brief.
- Added documentation validation.

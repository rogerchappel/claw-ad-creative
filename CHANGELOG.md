# Changelog

## Unreleased

- `check-meta-drafts` fails ad sets with no age set (Ads Manager blocks
  publishing them with #1487842/#1487843) and warns on ads that reuse an
  existing creative instead of reporting every field missing. Reused creatives
  break Identity under a rebuilt iOS 14+ campaign.

- iOS install campaigns are now built as iOS 14+ campaigns and run on Facebook
  and Instagram only by default. `creative:upload` refuses an iOS config without
  `skadnetworkAttribution`, and `check-meta-drafts` fails ad sets limited to
  iOS 14.4 and earlier and warns on Audience Network. The skill reads spend by
  placement on day 1.

- Added a cold-traffic copy brief to the skill: four jobs before the product,
  17 questions to answer before writing, market to segment to buyer targeting,
  writing from a reference ad's structure, and bet sizing per concept. Added
  matching limits on mechanism claims, fear, urgency and people on screen.
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

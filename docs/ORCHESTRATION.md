# Release Orchestration

## Release Surface

`claw-ad-creative` is a docs and skill package. Its release checks validate documentation, examples, installation scripts, support docs, and package contents without contacting external ad platforms.

## Verification Flow

1. Install dependencies with `npm install` when no lockfile is present.
2. Run `npm run release:check`.
3. Run `releasebox check .` with the `docs` project profile.
4. Preview release notes in the release dry-run workflow.

## Safety Notes

- Installation helpers support a check mode and should not mutate user systems during CI.
- Package checks are local-first and do not require API credentials.
- GitHub releases remain reviewed; npm publishing is disabled in `releasebox.config.json`.

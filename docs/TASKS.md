# Release Tasks

## Current Release Candidate

- Keep OpenClaw and CrewCMD installation docs aligned with `scripts/install-mcps.sh`.
- Verify bundled skill metadata and references with `npm run release:check`.
- Confirm the package dry run includes docs, examples, scripts, support docs, and skill assets.
- Review generated release notes before creating a GitHub release.

## Not In Scope

- Publishing to npm is disabled for this reviewed release path.
- MCP installation scripts should remain opt-in and must not run during package checks.

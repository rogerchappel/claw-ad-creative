# CrewCMD Installation

This repo is designed to be installable as a CrewCMD/OpenClaw skill package.
The skill content lives in `skills/facebook-ad-creative/SKILL.md`; the
machine-readable install contract lives beside it in `skill.json`.

## Install From A Library

When published to a skill library, CrewCMD should ingest:

- `manifest.json` for the package summary,
- `skills/facebook-ad-creative/SKILL.md` for agent instructions,
- `skills/facebook-ad-creative/skill.json` for metadata and config schema,
- `scripts/install-mcps.sh` for local prerequisite checks and config snippets.

The expected browse/import payload mirrors CrewCMD's installable skill shape:

```json
{
  "name": "Facebook Ad Creative",
  "slug": "facebook-ad-creative",
  "description": "Research Meta ads, generate creative assets, prepare safe ad drafts, and report performance.",
  "source": "github",
  "version": "0.2.0",
  "sourceUrl": "https://github.com/rogerchappel/claw-ad-creative",
  "content": "skills/facebook-ad-creative/SKILL.md",
  "metadata": "skills/facebook-ad-creative/skill.json"
}
```

## Vault Secrets

Store credentials in the CrewCMD/OpenClaw vault. Do not paste raw API keys into
skill config, chat, docs, or repository files.

Recommended secret names:

- `fal-api-key` -> `FAL_KEY`
- `ads-library-api-key` -> `ADS_LIBRARY_API_KEY`
- Higgsfield MCP uses connector/account authentication rather than a copied API
  key for the public hosted MCP.
- `meta-ads-access-token` -> `META_ACCESS_TOKEN`
- `meta-ad-account-id` -> `META_AD_ACCOUNT_ID`

Minimum useful setup:

```json
{
  "falSecretRef": { "name": "fal-api-key" },
  "adsLibraryProvider": "browser-or-scraper",
  "defaultMarket": "AU",
  "defaultBrand": "Catalogue Viewer",
  "canCreatePausedAds": false,
  "canPublishAds": false,
  "canChangeBudget": false
}
```

Ad ops/reporting setup, still conservative:

```json
{
  "falSecretRef": { "name": "fal-api-key" },
  "adsLibrarySecretRef": { "name": "ads-library-api-key" },
  "higgsfieldEnabled": true,
  "metaSecretRef": { "name": "meta-ads-access-token" },
  "adsLibraryProvider": "apify",
  "defaultMarket": "AU",
  "defaultBrand": "Catalogue Viewer",
  "canCreatePausedAds": true,
  "canPublishAds": false,
  "canChangeBudget": false
}
```

## Local Setup Check

Run:

```sh
bash scripts/install-mcps.sh check
```

Print starter runtime snippets:

```sh
bash scripts/install-mcps.sh print-config
```

The script does not write config files or secrets. It prints snippets because
OpenClaw/CrewCMD installations differ across macOS, Linux, and WSL.

## MCP Server Defaults

Use these as starting points, not hard requirements:

- `fal`: official fal MCP for image/video model discovery and inference.
- `facebook-ads-library`: public Ads Library research via a read-only provider.
- `higgsfield`: optional hosted video generation connector.
- `meta-ads`: optional ad account actions/reporting, disabled until approval
  gates are configured.

Keep Meta Ads access out of the creative research agent. Add it only to an ad
ops/reporting agent, and keep publish and budget changes approval-gated.

## Cross-Platform Notes

- macOS: install Node 20+ with your preferred package manager.
- WSL/Linux: install Node 20+ and confirm `node`, `npm`, and `npx` are on PATH.
- Use vault injection for environment variables instead of shell profile exports
  when the skill runs inside CrewCMD/OpenClaw.

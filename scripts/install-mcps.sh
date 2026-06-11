#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-check}"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/install-mcps.sh check
  bash scripts/install-mcps.sh print-config

This script is intentionally conservative. It checks local prerequisites and
prints MCP/runtime config snippets, but it does not write secrets or mutate a
user's OpenClaw/CrewCMD config by default.

Expected secret names in the vault:
  fal-api-key                 -> FAL_KEY
  ads-library-api-key         -> ADS_LIBRARY_API_KEY (optional)
  meta-ads-access-token       -> META_ACCESS_TOKEN (optional)

Higgsfield's public MCP is URL/account-auth based. Enable it in your MCP client
and sign in through the connector when prompted.
USAGE
}

need_bin() {
  local bin="$1"
  if command -v "$bin" >/dev/null 2>&1; then
    printf "ok: %s found at %s\n" "$bin" "$(command -v "$bin")"
  else
    printf "missing: %s\n" "$bin"
    return 1
  fi
}

check() {
  local failed=0
  need_bin node || failed=1
  need_bin npm || failed=1
  need_bin npx || failed=1

  if command -v jq >/dev/null 2>&1; then
    printf "ok: jq found at %s\n" "$(command -v jq)"
  else
    printf "warn: jq not found; useful for inspecting OpenClaw JSON config\n"
  fi

  if [[ -n "${FAL_KEY:-}" ]]; then
    printf "ok: FAL_KEY is present in this shell\n"
  else
    printf "info: FAL_KEY is not present in this shell; prefer vault injection at runtime\n"
  fi

  if [[ "$failed" -ne 0 ]]; then
    printf "\nInstall Node.js 20+ and npm/npx, then rerun this check.\n" >&2
    return 1
  fi
}

print_config() {
  node "$ROOT_DIR/scripts/print-openclaw-config.mjs"
}

case "$MODE" in
  check)
    check
    ;;
  print-config)
    print_config
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

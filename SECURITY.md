# Security Policy

This repository is docs-first, but it describes workflows that can touch ad
accounts, generated assets, budgets, and customer data. Treat examples and
contributions with the same care you would apply to automation code.

## Reporting a Vulnerability

Please do not report suspected vulnerabilities in public issues, pull requests,
or discussions.

Ask maintainers for the private security reporting path before sharing details.
If no private reporting path exists yet, ask maintainers through public project
channels for a private reporting path. Do not include exploit details, secrets,
personal data, or sensitive technical details in public messages.

## Sensitive Data

Do not commit:

- API keys or MCP credentials,
- Meta ad account IDs,
- pixel IDs,
- access tokens,
- customer lists,
- custom audience exports,
- unpublished campaign plans,
- private generated assets,
- client confidential information.

Use placeholders in examples.

## Scope

In scope:

- insecure default guidance shipped by this project,
- examples that encourage unsafe ad-account permissions,
- skill instructions that could cause unauthorized spend or publishing,
- CI, release, or dependency guidance maintained by this project.

Out of scope:

- general support requests,
- requests for guaranteed maintenance timelines,
- issues in unrelated downstream projects or third-party MCP servers.

## Disclosure

Coordinate disclosure with maintainers before publishing vulnerability details.

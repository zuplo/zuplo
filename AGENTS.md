# zuplo/zuplo

This repository contains Zuplo's public examples, packages, prompts, snippets,
and developer tools. Keep changes scoped to the project or example being
edited. Subdirectories may contain more specific `AGENTS.md` or `CLAUDE.md`
instructions that take precedence for that area.

## Toolchain

- Node.js 22 and Go 1.23 are pinned in `.tool-versions`.
- Use npm for the root workspace. Install dependencies with `npm install`.
- Run `npm run test:starter-kits` when changing starter kits or their shared
  code.
- Run a package's own scripts when changing files under `packages/` or
  `tools/`.

## Repository map

- `examples/` contains standalone Zuplo API gateway projects. Read
  `examples/CLAUDE.md` and the example's own `AGENTS.md` before editing one.
- `packages/` contains packages published to npm.
- `tools/` contains standalone developer utilities.
- `prompts/` and `snippets/` contain reusable public guidance and code samples.

## Change guidelines

- Preserve each example's existing structure and configuration style.
- Never add real API keys, tokens, secret-bearing deployment URLs, or customer
  data. Use documented placeholders and `env.example` files.
- Keep OpenAPI documents and Zuplo route or policy configuration consistent
  when a change affects both.
- Run the narrowest relevant tests or build command and report any checks that
  could not run.

## Agent discovery

The root `plugin.json` and `mcp.json` follow the Agent Plugins 1.0.0
specification. Keep their schema versions aligned. MCP authorization is handled
by the client; do not put credentials in `mcp.json`.

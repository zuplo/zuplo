# Zuplo

This is a monorepo containing a few public-facing projects for Zuplo.

AI coding agents can start with [AGENTS.md](./AGENTS.md). This repository is
also an [Agent Plugins 1.0.0](https://agent-plugins.org/specification) package:
see [plugin.json](./plugin.json) for its manifest and [mcp.json](./mcp.json) for
Zuplo's Docs and Platform MCP server connections.

## Examples

This subfolder contains examples showing how to perform various tasks with [Zuplo](https://zuplo.com).

## Starter Kits

`starter-kits/` contains 50 forkable API starter kits, each pairing a REST API with an MCP server backed by a pluggable, HTTP-only database adapter (Supabase, Firestore, ClickHouse, Upstash Redis, Neon, in-memory). Every kit ships multi-tenant via API-key metadata, deployable as a SaaS replacement.

Coverage: HR (6), Finance (7), Sales (6), Customer Success (4), Marketing (6), IT/Operations (7), Productivity (5), Verticals (9). 718 MCP tools registered across all kits.

Start with the gallery in [starter-kits/README.md](./starter-kits/README.md) or the index at [starter-kits/starter-kits.json](./starter-kits/starter-kits.json).

## Packages

This subfolder contains various NodeJS packages that are published to NPM.

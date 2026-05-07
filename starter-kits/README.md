# Zuplo Starter Kits

Forkable API starter kits for replacing SaaS with custom internal apps. Each kit ships:

- A complete REST API on Zuplo
- An MCP server so the same surface drives AI agents
- A pluggable, HTTP-only database adapter (Supabase, Firestore, ClickHouse, Upstash Redis, Neon HTTP)
- API keys with `tenantId` scoping for multi-tenant SaaS replacement
- Per-kit documentation and quickstart

## Why these exist

Developers are increasingly building internal tools to replace SaaS — HR portals, time tracking, billing tools, internal CRMs, support consoles. Starter kits give them a forkable foundation that's already wired up for both REST and MCP, so a custom app and an AI agent share one source of truth.

## Forking a kit

```bash
npx create-zuplo-api@latest --example starter-kits/<kit-name>
```

Then:

```bash
cp env.example .env
# Edit .env to pick a database provider and fill in credentials
npm install
npm run dev
```

The gateway boots at `http://localhost:9000`. Hit your endpoints, or connect an MCP inspector to `http://localhost:9000/mcp`:

```bash
npx @modelcontextprotocol/inspector
```

## Picking a database

All adapters use HTTP only — no native drivers, no direct TCP — because Zuplo runs in an edge runtime. The shipped adapters are:

| Adapter | Best for | Transactions | Aggregations |
|---|---|---|---|
| Supabase (PostgREST) | General-purpose Postgres, relational data, RLS | Yes | SQL |
| Firestore (REST) | Document data, hierarchical scoping, Firebase ecosystem | Limited (per-doc) | None |
| ClickHouse (HTTP) | Event/time-series data, analytics, aggregations | No | SQL |
| Upstash Redis (REST) | KV, queues, counters, rate-limits, ephemeral state | No | None |
| Neon (HTTP serverless) | Postgres without Supabase features (cheaper, leaner) | Yes | SQL |
| In-memory | Tests and local development | Yes | None |

Each kit declares which adapters it supports in its README. Pick the one that fits your domain.

## Multi-tenancy and auth

Every kit ships with the `api-key-inbound` policy and a `tenantId` resolved from API key metadata. Every entity has a `tenantId` column/field, and the repository layer requires it on every read and write. Result: a kit deploys as a multi-tenant SaaS replacement out of the box.

For AI-client-facing kits (Claude Desktop, ChatGPT MCP, Inspector), an optional OAuth (JWT) profile is documented in `_template/` — uncomment and configure when needed.

## Repository layout

```
starter-kits/
├── _shared/              # Shared adapters, auth helpers, MCP utilities
│   ├── adapters/         # Repository<T> + 6 implementations
│   ├── auth/             # Tenant resolution from API key
│   └── mcp/              # MCP tool description helpers
├── _template/            # Canonical kit — copy this to start a new kit
├── starter-kits.json     # Gallery index for the docs site
└── <kit-name>/           # 50 kits (see plan for the full list)
```

## Building a new kit

1. `cp -r starter-kits/_template starter-kits/<kit-name>`
2. Update `package.json` `name`, `zuplo.jsonc`, and `README.md` headers
3. Define your entities in `modules/repositories/`
4. Add CRUD routes in `config/routes.oas.json` with `x-zuplo-route.mcp: { type: "tool" }`
5. Add 1–2 orchestrator tools in `modules/mcp-tools/` (use `context.invokeRoute()` to call sibling routes)
6. Register every MCP-exposed `operationId` in the `/mcp` route's `operations: [...]` array
7. Add the kit to `starter-kits.json`

See [CLAUDE.md](./CLAUDE.md) for the full conventions every kit follows.

## Related Docs

- [Zuplo MCP Server documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo Examples](../examples/) — feature-focused demos (separate from full starter kits)

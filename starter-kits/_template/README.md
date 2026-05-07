# Starter Kit Template

Canonical Zuplo Starter Kit — a complete, runnable example showing every convention used by the 50 kits in this directory. Copy this and replace the `Item` entity with your domain to start a new kit.

Replaces: nothing (this is the foundation).

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/my-kit
cd starter-kits/my-kit
cp env.example .env
npm install
npm run dev
# Gateway boots at http://localhost:9000
```

Connect an MCP inspector:

```bash
npx @modelcontextprotocol/inspector
# Point it at http://localhost:9000/mcp
```

## Choosing a database

| Adapter | Status |
|---|---|
| `in-memory` | Default — boots without any credentials |
| `supabase` | Supported |
| `firestore` | Supported |
| `clickhouse` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example).

The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/items` | List items |
| POST | `/items` | Create item |
| GET | `/items/{id}` | Get item |
| DELETE | `/items/{id}` | Delete item |
| POST | `/summarize-items` | Orchestrator: group items by status |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_items` | tool | yes | List items in tenant |
| `get_item` | tool | yes | Get item by id |
| `create_item` | tool | no | Create item |
| `delete_item` | tool | destructive | Delete item |
| `summarize_items` | tool | yes | Group items by status (orchestrator) |

## The AI angle

`summarize_items` shows the orchestrator pattern: a single MCP tool that calls `list_items` internally via `context.invokeRoute()` and shapes the response for an LLM. This is the canonical "AI angle" — when you fork this kit, replace it with a domain-specific orchestrator that does real work (chase overdue invoices, find coverage gaps, triage tickets, etc.).

## Extending

- **New entity:** add fields to `Item` in `modules/repositories/items.ts`, update the OpenAPI schema in `config/routes.oas.json`.
- **New endpoint:** create a handler in `modules/handlers/`, add the route to `routes.oas.json` with `mcp: { type: "tool" }` if exposed to MCP, and add the `operationId` to the `/mcp` route's `operations: [...]` array.
- **New orchestrator MCP tool:** create a handler in `modules/mcp-tools/`, follow the pattern in `summarize-items.ts` (use `invokeJson` from `../_shared/mcp/helpers.ts`).
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

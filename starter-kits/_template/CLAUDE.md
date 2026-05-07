# Starter Kit Template

This is the canonical Zuplo Starter Kit. Copy this directory to scaffold a new kit. Replace the `Item` example entity with your domain (Invoice, Ticket, Employee, etc.) and add your own orchestrator MCP tools.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Routes + MCP annotations (Layer 1) + `/mcp` operations array (Layer 2) |
| `config/policies.json` | api-key-inbound, rate-limit, prompt-injection-outbound, secret-masking-outbound |
| `modules/repositories/items.ts` | Item entity + repository factory keyed by `DB_PROVIDER` |
| `modules/handlers/*.ts` | One file per CRUD endpoint |
| `modules/mcp-tools/summarize-items.ts` | Canonical orchestrator MCP tool — uses `context.invokeRoute()` |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/items` | List items in tenant |
| POST | `/items` | Create item |
| GET | `/items/{id}` | Get item |
| DELETE | `/items/{id}` | Delete item |
| POST | `/summarize-items` | Orchestrator: group items by status |
| POST | `/mcp` | MCP server endpoint |

## Replacing the example with your domain

1. Rename `Item` → your entity (Invoice, Ticket, Employee, etc.) in:
   - `modules/repositories/items.ts`
   - All handler files in `modules/handlers/`
   - `config/routes.oas.json` operations and schemas
2. Update the entity's fields in the `Item` interface.
3. Update `routes.oas.json` schema components to match.
4. Replace `summarize-items.ts` with your kit's orchestrator(s) — 1–2 tools minimum that compose multiple endpoints.
5. Register every MCP-exposed `operationId` in the `/mcp` route's `operations: [...]` array.
6. Update `package.json` `name` and the kit's `README.md`.
7. Add an entry in `../starter-kits.json`.

## Verifying the kit boots

```bash
cp env.example .env
npm install
npm run dev
# In another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

The Inspector should show tools: `list_items`, `get_item`, `create_item`, `delete_item`, `summarize_items` — all five.

# Quote / CPQ Starter Kit

Headless API for B2B quote and CPQ (configure-price-quote) workflows. Replaces Salesforce CPQ, DealHub, and PandaDoc CPQ.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/my-kit
cd starter-kits/quote-cpq
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
| `upstash-redis` | Supported |
| `neon` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example).

The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/quotes` | List quotes |
| POST | `/quotes` | Create draft quote |
| GET | `/quotes/{id}` | Get quote |
| POST | `/quotes/{id}/line-items` | Add line item |
| DELETE | `/quotes/{id}/line-items/{lineId}` | Remove line item |
| POST | `/quotes/{id}/discounts` | Apply discount |
| POST | `/quotes/{id}/send` | Send quote (status → sent) |
| POST | `/quotes/{id}/accept` | Accept quote (status → accepted) |
| GET | `/products` | List product catalog |
| GET | `/pricing-rules` | List pricing rules |
| POST | `/build-quote-from-requirements` | Orchestrator |
| POST | `/route-for-discount-approval` | Orchestrator |
| POST | `/explain-pricing` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_quotes` | tool | yes | List quotes |
| `get_quote` | tool | yes | Get quote by id |
| `create_quote` | tool | no | Create draft quote |
| `add_line_item` | tool | no | Add line to quote |
| `remove_line_item` | tool | destructive | Remove line from quote |
| `apply_discount` | tool | no | Apply discount |
| `send_quote` | tool | no | Mark quote sent |
| `accept_quote` | tool | no | Mark quote accepted |
| `list_products` | tool | yes | List catalog |
| `list_pricing_rules` | tool | yes | List rules |
| `build_quote_from_requirements` | tool | no | Build a priced quote (orchestrator) |
| `route_for_discount_approval` | tool | yes | Approval routing decision (orchestrator) |
| `explain_pricing` | tool | yes | Price breakdown (orchestrator) |

## The AI angle

The kit's three orchestrators turn natural-language sales asks into headless CPQ work. `build_quote_from_requirements` takes a list of products and a customer segment, applies the matching pricing rules, and writes a priced quote with full trace. `route_for_discount_approval` decides whether a quote needs deal-desk sign-off based on its effective discount. `explain_pricing` rebuilds the list-price → rules → discounts → final breakdown an LLM needs to talk pricing with a buyer.

## Extending

- **New entity:** add fields to the entity interface in `modules/repositories/`, update the OpenAPI schema in `config/routes.oas.json`.
- **New endpoint:** create a handler in `modules/handlers/`, add the route to `routes.oas.json` with `mcp: { type: "tool" }` if exposed to MCP, and add the `operationId` to the `/mcp` route's `operations: [...]` array.
- **New orchestrator MCP tool:** create a handler in `modules/mcp-tools/`, follow the pattern in `build-quote-from-requirements.ts` (use `invokeJson` from `../_shared/mcp/helpers.ts`).
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

# Lead Routing / SDR Starter Kit

Headless API for sales development teams. Replaces Chili Piper, LeanData, and Salesforce Flow routing.

## Quickstart

```bash
cd starter-kits/lead-routing
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

See [env.example](./env.example). The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leads` | List leads |
| POST | `/leads` | Create lead |
| GET | `/leads/{id}` | Get lead |
| PATCH | `/leads/{id}/assign` | Assign lead |
| PATCH | `/leads/{id}/qualify` | Mark qualified |
| PATCH | `/leads/{id}/disqualify` | Mark unqualified |
| GET | `/routing-rules` | List routing rules |
| POST | `/routing-rules` | Create routing rule |
| GET | `/territories` | List territories |
| POST | `/meeting-bookings` | Book meeting |
| POST | `/route-lead-intelligently` | Orchestrator |
| POST | `/match-lead-to-account` | Orchestrator |
| POST | `/summarize-unworked-leads` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_leads` | tool | yes | List leads |
| `get_lead` | tool | yes | Get lead by id |
| `create_lead` | tool | no | Create lead |
| `assign_lead` | tool | no | Assign lead to rep |
| `qualify_lead` | tool | no | Mark lead qualified |
| `disqualify_lead` | tool | no | Mark lead unqualified |
| `list_routing_rules` | tool | yes | List rules |
| `create_routing_rule` | tool | no | Create rule |
| `list_territories` | tool | yes | List territories |
| `book_meeting` | tool | no | Book a meeting |
| `route_lead_intelligently` | tool | no | Auto-route a lead (orchestrator) |
| `match_lead_to_account` | tool | yes | Find related leads (orchestrator) |
| `summarize_unworked_leads` | tool | yes | Stale-pipeline scan (orchestrator) |

## The AI angle

`route_lead_intelligently` is the high-leverage tool: hand it a lead id, it walks active routing rules in priority order, picks the first matching rule, assigns the rep, and returns a per-rule trace explaining the decision. `match_lead_to_account` lets the LLM detect duplicate / sibling contacts at the same company before assignment. `summarize_unworked_leads` powers an SDR-manager weekly review — "show me leads my reps have been sitting on for 7+ days" — without anyone writing SQL.

## Extending

- **New entity:** add fields to the entity interface in `modules/repositories/`, update the OpenAPI schema in `config/routes.oas.json`.
- **New endpoint:** create a handler, add the route with `mcp: { type: "tool" }` if exposed, add the `operationId` to `/mcp` `operations`.
- **New orchestrator:** add to `modules/mcp-tools/` using `invokeJson` from `@zuplo/starter-kit-shared/mcp`.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

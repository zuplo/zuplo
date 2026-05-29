# Commission / Sales Comp API

Comp plans, quotas, credits, and payouts with MCP tools that explain commission amounts, model what-ifs, and flag clawback risk.

**Replaces:** CaptivateIQ, Spiff, Xactly.
**SEO target:** "commission api".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/sales-commission
cd sales-commission
cp env.example .env
npm install
npm run dev
```

The gateway boots at `http://localhost:9000`. To explore the MCP server:

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

## Choosing a database

This kit ships with HTTP-only adapters (the kits run in Zuplo's edge runtime — no TCP drivers). Set `DB_PROVIDER` in `.env` to one of:

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default — the kit boots without any credentials so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example).

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| POST | `/credit` | `record_credit` | Record Credit | tool |
| GET | `/credits` | `list_credits` | List Credits | tool |
| POST | `/explain-commission-amount` | `explain_commission_amount` | Explain Commission Amount | tool |
| POST | `/flag-clawback-risk` | `flag_clawback_risk` | Flag Clawback Risk | tool |
| POST | `/model-what-if-close` | `model_what_if_close` | Model What If Close | tool |
| GET | `/payout/{id}` | `get_payout` | Get Payout | tool |
| POST | `/payout/{id}/approve` | `approve_payout` | Approve Payout | tool |
| GET | `/payouts` | `list_payouts` | List Payouts | tool |
| POST | `/payouts/calculate` | `calculate_payouts` | Calculate Payouts | tool |
| POST | `/plan` | `create_plan` | Create Plan | tool |
| GET | `/plans` | `list_plans` | List Plans | tool |
| PATCH | `/quota/{id}` | `set_quota` | Set Quota | tool |
| GET | `/quotas` | `list_quotas` | List Quotas | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

13 tools registered: `approve_payout`, `calculate_payouts`, `create_plan`, `get_payout`, `list_credits`, `list_payouts`, `list_plans`, `list_quotas`, `record_credit`, `set_quota`, `explain_commission_amount`, `flag_clawback_risk`, `model_what_if_close`.

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

The orchestrator MCP tools shipped with this kit are where the agentic value compounds — they read multi-source signals through `context.invokeRoute()` and shape the response for an LLM, rather than dumping raw rows. Agents work best when they can call a few purposeful tools (`triage_x`, `summarize_x`, `flag_x`) instead of every CRUD endpoint.

Per the [conventions doc](../CLAUDE.md), every CRUD endpoint inherits `api-key-inbound` + `rate-limit` policies, and the `/mcp` route adds `prompt-injection-outbound` + `secret-masking-outbound` defenses for AI traffic.

## Extending

- **New entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **New endpoint:** add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **New orchestrator MCP tool:** drop a file in `modules/mcp-tools/` that uses `invokeJson` from `@zuplo/starter-kit-shared/mcp` to compose existing endpoints. Pass the inbound `authorization` header through so the inner calls re-run policies.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.

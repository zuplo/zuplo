# Sales Pipeline / Forecast API

Deals, forecasts, snapshots, and quotas with MCP tools that roll up forecasts, flag at-risk deals, and compare week over week.

**Replaces:** Clari, BoostUp, Salesforce forecasting.
**SEO target:** "sales forecast api".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/sales-pipeline-forecast
cd sales-pipeline-forecast
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
| POST | `/compare-week-over-week` | `compare_week_over_week` | Compare Week Over Week | tool |
| PATCH | `/deal-forecast-category/{id}` | `update_deal_forecast_category` | Update Deal Forecast Category | tool |
| GET | `/deal/{id}` | `get_deal` | Get Deal | tool |
| GET | `/deals` | `list_deals` | List Deals | tool |
| POST | `/flag-at-risk-deals` | `flag_at_risk_deals` | Flag At Risk Deals | tool |
| GET | `/forecast/{id}` | `get_forecast` | Get Forecast | tool |
| POST | `/forecast/{id}/submit` | `submit_forecast` | Submit Forecast | tool |
| GET | `/forecasts` | `list_forecasts` | List Forecasts | tool |
| GET | `/pipeline-snapshots` | `list_pipeline_snapshots` | List Pipeline Snapshots | tool |
| PATCH | `/quota/{id}` | `set_quota` | Set Quota | tool |
| GET | `/quotas` | `list_quotas` | List Quotas | tool |
| POST | `/roll-up-forecast` | `roll_up_forecast` | Roll Up Forecast | tool |
| POST | `/take-snapshot` | `take_snapshot` | Take Snapshot | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

13 tools registered: `get_deal`, `get_forecast`, `list_deals`, `list_forecasts`, `list_pipeline_snapshots`, `list_quotas`, `set_quota`, `submit_forecast`, `take_snapshot`, `update_deal_forecast_category`, `compare_week_over_week`, `flag_at_risk_deals`, `roll_up_forecast`.

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

The orchestrator MCP tools shipped with this kit are where the agentic value compounds — they read multi-source signals through `context.invokeRoute()` and shape the response for an LLM, rather than dumping raw rows. Agents work best when they can call a few purposeful tools (`triage_x`, `summarize_x`, `flag_x`) instead of every CRUD endpoint.

Per the [conventions doc](../CLAUDE.md), every CRUD endpoint inherits `api-key-inbound` + `rate-limit` policies, and the `/mcp` route adds `prompt-injection-outbound` + `secret-masking-outbound` defenses for AI traffic.

## Extending

- **New entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **New endpoint:** add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **New orchestrator MCP tool:** drop a file in `modules/mcp-tools/` that uses `invokeJson` from `../_shared/mcp/helpers.ts` to compose existing endpoints. Pass the inbound `authorization` header through so the inner calls re-run policies.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.

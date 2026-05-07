# Marketing Attribution API

A Zuplo Starter Kit that ships a first-party marketing-attribution API and an MCP server. Record visitor touchpoints, identify visitors, log conversions, and compute attributed value across multiple models — first-touch, last-touch, linear, position-based, time-decay — all multi-tenant out of the box.

Replaces: Dreamdata, Attribution.com, RollWorks.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/marketing-attribution
cd starter-kits/marketing-attribution
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
| `clickhouse` | Recommended for touchpoint volume |
| `supabase` | Supported |
| `firestore` | Supported |
| `neon` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example).

The kit boots with `DB_PROVIDER=in-memory` if no env vars are set.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/touchpoints` | List touchpoints (filter by visitorId, channel) |
| POST | `/touchpoints` | Record a touchpoint |
| GET | `/visitors` | List visitors |
| GET | `/visitors/{id}` | Get a visitor |
| PATCH | `/visitors/{id}` | Identify a visitor (attach email + traits) |
| GET | `/conversions` | List conversions (filter by visitorId) |
| POST | `/conversions` | Record a conversion |
| GET | `/channels` | List channels with period spend |
| GET | `/attribution-models` | List attribution models |
| POST | `/explain-conversion-path` | Orchestrator: per-model attribution for one visitor |
| POST | `/compare-attribution-models` | Orchestrator: model x channel side-by-side |
| POST | `/find-underrated-channels` | Orchestrator: spot under-credited assist channels |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_touchpoints` | tool | yes | List touchpoints |
| `record_touchpoint` | tool | no | Append a touchpoint |
| `list_visitors` | tool | yes | List visitors |
| `get_visitor` | tool | yes | Get a visitor |
| `identify_visitor` | tool | idempotent | Attach email + traits |
| `list_conversions` | tool | yes | List conversions |
| `record_conversion` | tool | no | Record a conversion |
| `list_channels` | tool | yes | List channels |
| `list_attribution_models` | tool | yes | List attribution models |
| `explain_conversion_path` | tool | yes | Per-model path explainer (orchestrator) |
| `compare_attribution_models` | tool | yes | Model x channel comparison (orchestrator) |
| `find_underrated_channels` | tool | yes | Highlight under-credited channels (orchestrator) |

## The AI angle

Attribution arguments are CMO-CRO power struggles. The three orchestrators in this kit — `explain_conversion_path`, `compare_attribution_models`, and `find_underrated_channels` — turn the raw touchpoint stream into the kind of side-by-side answers that end the argument. An assistant can answer "why do we credit paid_search instead of organic for this deal?" or "which channels look weak under last-touch but strong under linear?" without bouncing the user between BI dashboards. Each orchestrator stays inside the gateway and uses `context.invokeRoute()` so it inherits auth, rate-limit, and tenant scoping.

## Extending

- **Real channel cost integration:** wire each `Channel` row to its ad-platform spend API and recompute `costCents` on a schedule.
- **Custom model:** add a new `AttributionModel.kind` and extend `modelWeights` in `compare-attribution-models.ts` and `explain-conversion-path.ts`.
- **CRM enrichment:** when `record_conversion` fires with `dealId`, also call your CRM to refresh the contact and account.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes. Use ClickHouse for high-volume telemetry; Postgres-style stores work fine for B2B SaaS.

# Product Analytics Events Starter Kit

Headless product analytics events API. Ingest events, identify users, define funnels and cohorts, and run orchestrator MCP tools that propose funnels from natural-language questions, find drop-off steps, and compare cohorts.

Replaces: Mixpanel, Amplitude (lightweight self-hosted equivalents).

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/product-analytics
cd starter-kits/product-analytics
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

ClickHouse is the recommended adapter for events because event volume is high and analytical queries dominate the workload. The other adapters work fine for development and low-volume tenants.

| Adapter | Status |
|---|---|
| `clickhouse` | Recommended for events. Push aggregations into SQL. |
| `in-memory` | Default - boots without any credentials. Use for tests. |
| `supabase` | Supported. Fine for small/medium volumes. |
| `neon` | Supported. Postgres-backed analytics. |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`.

## Environment variables

See [env.example](./env.example).

The kit boots with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List recent events |
| POST | `/ingest-event` | Ingest a single event |
| POST | `/ingest-events-batch` | Ingest a batch of events |
| GET | `/users` | List users |
| GET | `/users/{id}` | Get a user |
| PATCH | `/users/{id}` | Identify (attach email + merge traits) |
| GET | `/funnels` | List funnels |
| GET | `/funnels/{slug}` | Get a funnel by slug |
| POST | `/funnels` | Create a funnel |
| POST | `/compute-funnel` | Compute funnel counts in a window |
| GET | `/cohorts` | List cohorts |
| POST | `/cohorts` | Create a cohort |
| POST | `/compute-cohort` | Compute a cohort's membership |
| POST | `/define-funnel-from-question` | Orchestrator: propose funnel from a question |
| POST | `/find-drop-off-step` | Orchestrator: worst step in a funnel |
| POST | `/compare-cohorts` | Orchestrator: cohort A vs cohort B |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_events` | yes | List recent events |
| `ingest_event` | no | Ingest a single event |
| `ingest_events_batch` | no | Ingest many events |
| `list_users` | yes | List users |
| `get_user` | yes | Get a user |
| `identify_user` | no | Attach email + merge traits |
| `list_funnels` | yes | List funnels |
| `get_funnel` | yes | Get a funnel by slug |
| `create_funnel` | no | Save a funnel |
| `compute_funnel` | yes | Compute counts + conversion |
| `list_cohorts` | yes | List cohorts |
| `create_cohort` | no | Save a cohort |
| `compute_cohort` | no | Compute membership and update count |
| `define_funnel_from_question` | yes | Propose steps from a natural-language question |
| `find_drop_off_step` | yes | Worst step in a funnel over a window |
| `compare_cohorts` | yes | Cohort A vs cohort B on a metric |

## The AI angle

Three orchestrators turn the API into a self-driving analytics surface. `define_funnel_from_question` accepts a natural-language question and a list of candidate event names and proposes a funnel by token overlap (a stub matcher you can swap for an LLM call). `find_drop_off_step` calls `compute_funnel` for the last N days and returns the step with the worst step-to-step conversion, so an agent can paste the result back to a PM. `compare_cohorts` pulls two cohorts and computes mean session or event count per user, returning the delta. All three run inside the gateway via `invokeRoute` (or directly against repositories) so they inherit auth, rate-limiting, and tenant scoping.

## Extending

- **Add an event property:** events have a free-form `properties` object — no schema change needed.
- **Add a funnel filter dimension:** event properties are matched by simple equality in `compute_funnel`. Swap that for a richer filter language as needed.
- **Add a new orchestrator:** create a handler in `modules/mcp-tools/`, register the route + `mcp` annotation in `routes.oas.json`, and add the operationId to the `/mcp` operations array.
- **Switch databases:** change `DB_PROVIDER` in `.env`. ClickHouse is recommended for the events table; the other repositories can stay on Postgres if that's simpler.

# Product Analytics Events API

A headless event-ingest + funnel + cohort API that lands events in ClickHouse for SQL-grade analytics, fans them out to PostHog so existing dashboards keep working, and exposes orchestrator MCP tools an agent can drive.

Replaces: Mixpanel, lightweight Amplitude, Heap. Or sit it in front of PostHog as the multi-tenant tenant-aware ingest layer you don't want to write yourself.

## Wires up

**ClickHouse** is the primary store. Events land in a `MergeTree` table keyed on `(tenantId, id)` so each tenant's queries stay fast even at billions of rows. The `compute_funnel` handler pushes the funnel computation down into a single `windowFunnel` SQL query — no events ever cross the wire when you ask "what's the conversion through these 4 steps last week?". **PostHog** is the optional fan-out target: every ingested event is mirrored via `/capture` (single events) or `/batch/` (bulk), and the `define_funnel_from_question` orchestrator can discover candidate event names via HogQL `/query` so funnel proposals are grounded in real volume.

## Architecture at a glance

```
Client SDK ──▶ Zuplo Gateway ──▶ POST /ingest-event
                                       │
                                       ├── ClickHouse (events table, MergeTree)
                                       └── PostHog /capture  (best-effort mirror)

Agent ──▶ POST /compute-funnel ──▶ ClickHouse windowFunnel  (when DB_PROVIDER=clickhouse)
                                ▶ in-memory walk           (otherwise)

Agent ──▶ POST /define-funnel-from-question
              │
              ├── caller-supplied event list, OR
              ├── PostHog HogQL (top events by volume), OR
              └── ClickHouse SELECT name, count() ...
```

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
| `clickhouse` | **Recommended for events.** Funnel computation pushes down to `windowFunnel`. |
| `in-memory` | Default — boots without any credentials. Use for tests. |
| `supabase` | Supported. Fine for small/medium volumes. |
| `neon` | Supported. Postgres-backed analytics. |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER` + the matching adapter creds, you can opt into:

- `POSTHOG_API_KEY` (project key) — enables event mirroring on `ingest_event` / `ingest_events_batch`
- `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` — enables HogQL discovery in `define_funnel_from_question`
- `POSTHOG_API_HOST` — defaults to `https://us.i.posthog.com`

The kit boots with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List recent events |
| POST | `/ingest-event` | Ingest a single event (mirrors to PostHog if configured) |
| POST | `/ingest-events-batch` | Ingest a batch (mirrors to PostHog /batch/ if configured) |
| GET | `/users` | List users |
| GET | `/users/{id}` | Get a user |
| PATCH | `/users/{id}` | Identify (attach email + merge traits) |
| GET | `/funnels` | List funnels |
| GET | `/funnels/{slug}` | Get a funnel by slug |
| POST | `/funnels` | Create a funnel |
| POST | `/compute-funnel` | Compute funnel counts (ClickHouse `windowFunnel` when configured) |
| GET | `/cohorts` | List cohorts |
| POST | `/cohorts` | Create a cohort |
| POST | `/compute-cohort` | Compute a cohort's membership |
| POST | `/define-funnel-from-question` | Orchestrator: propose a funnel from a question |
| POST | `/find-drop-off-step` | Orchestrator: worst step in a funnel |
| POST | `/compare-cohorts` | Orchestrator: cohort A vs cohort B |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `ingest_event` | repo, PostHog /capture | Ingest one event (mirrored) |
| `ingest_events_batch` | repo, PostHog /batch | Ingest many events |
| `list_events`, `list_users`, `get_user`, etc. | repo | Standard CRUD |
| `identify_user` | repo | Attach email + merge traits |
| `compute_funnel` | repo, ClickHouse windowFunnel | Counts + step-to-step conversion |
| `define_funnel_from_question` | PostHog HogQL OR ClickHouse | Propose a funnel grounded in real event volumes |
| `find_drop_off_step` | calls `compute_funnel` | Worst step over the last N days |
| `compare_cohorts` | repo | A/B comparison on a metric |

## The AI angle

`define_funnel_from_question` turns "where do users drop off in onboarding?" into a concrete funnel definition. If you didn't pass `candidateEvents`, it pulls the top event names from PostHog (HogQL: `SELECT event, count() FROM events …`) or from your kit's own ClickHouse table, scores token overlap with the question, and returns ordered steps with per-event volumes you can pipe straight into `create_funnel`. Pair it with `find_drop_off_step` (which calls `compute_funnel` for the last 7 days and returns the worst step) and an agent can answer "where's the drop-off in our signup flow?" in two tool calls — once to discover the funnel, once to compute it. Both stay inside the gateway via `invokeRoute`, so they inherit auth, rate-limit, and tenant scoping. The same MCP tool runs from Claude Desktop, an internal cron, or a PM's Slack assistant.

## Extending

- **Bulk-load existing events into ClickHouse:** use the `INSERT INTO ... FORMAT JSONEachRow` ClickHouse pattern via `clickhouseQuery({ sql, format: null })` from `modules/integrations/clickhouse.ts` — handles tens of thousands of rows per request without a temp file.
- **Self-hosted PostHog:** set `POSTHOG_API_HOST` to your instance URL; everything else is unchanged.
- **Replace HogQL discovery with embeddings:** swap `discoverFromPostHog` to query a vector store of event-name embeddings — you keep the orchestrator shape and just inject smarter candidate ranking.
- **Switch databases:** change `DB_PROVIDER` in `.env`. ClickHouse is recommended for the events table; the other repositories can stay on Postgres if that's simpler.

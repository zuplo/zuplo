# Product Analytics Events Starter Kit

Headless event tracking + lightweight funnels and cohorts. Replaces Mixpanel and lightweight Amplitude. See [../CLAUDE.md](../CLAUDE.md) for the conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Event` | Primary entity. The high-volume table — recommend ClickHouse in production. |
| `User` | Anonymous user that may later be identified. |
| `Session` | Bounded run of events from one device. |
| `Funnel` | Ordered list of step events. |
| `Cohort` | Criteria + cached user count. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List recent events |
| POST | `/ingest-event` | Ingest a single event |
| POST | `/ingest-events-batch` | Ingest a batch of events |
| GET | `/users` | List users |
| GET | `/users/{id}` | Get a user |
| PATCH | `/users/{id}` | Identify a user (email + traits) |
| GET | `/funnels` | List funnels |
| GET | `/funnels/{slug}` | Get a funnel by slug |
| POST | `/funnels` | Create a funnel |
| POST | `/compute-funnel` | Compute funnel counts in a window |
| GET | `/cohorts` | List cohorts |
| POST | `/cohorts` | Create a cohort |
| POST | `/compute-cohort` | Compute cohort membership |
| POST | `/define-funnel-from-question` | Orchestrator: propose a funnel from a question |
| POST | `/find-drop-off-step` | Orchestrator: worst funnel step |
| POST | `/compare-cohorts` | Orchestrator: cohort comparison |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `define_funnel_from_question` - token-overlap matcher between a natural-language question and supplied candidate event names. Stub behaviour suitable for swapping out with an LLM call.
- `find_drop_off_step` - calls `compute_funnel` for the last N days and returns the step with the largest drop in conversion.
- `compare_cohorts` - pulls users in two cohorts (by slug), computes per-user `session_count` or `event_count`, returns mean + count + delta.

## Adapter recommendation

Events are high-volume and read patterns are analytical, so ClickHouse is the recommended `DB_PROVIDER` for production. The other entities (User, Funnel, Cohort) are fine on Postgres or the same ClickHouse cluster.

## MCP tools registered

`list_events`, `ingest_event`, `ingest_events_batch`, `list_users`, `get_user`, `identify_user`, `list_funnels`, `get_funnel`, `create_funnel`, `compute_funnel`, `list_cohorts`, `create_cohort`, `compute_cohort`, `define_funnel_from_question`, `find_drop_off_step`, `compare_cohorts`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

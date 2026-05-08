# A/B Testing & Feature Flag API

A self-hosted feature flag and experimentation API with consistent-hash variant assignment, statistical interpretation, and an MCP server agents can drive — optionally backed by PostHog so existing dashboards keep working.

Replaces: Optimizely, LaunchDarkly, Statsig, Vercel Flags. Use it standalone or as a thin gateway in front of PostHog.

## Wires up

**PostHog** is the optional backing store. Call `/v1/flags/{key}/decide` on the gateway and it cascades: PostHog `/decide` if the flag is sourced from PostHog (or you pass `forcePostHog: true`), otherwise local consistent-hash assignment against the kit's flag rollout config or experiment variants. Whichever path resolves, the call also fires a `$feature_flag_called` event into PostHog so your existing experiments and dashboards see the exposure. New experiments can be mirrored into PostHog as multivariate flags via `mirrorToPostHog: true` on `create_experiment`. The `interpret_results` orchestrator also runs a HogQL query against `$feature_flag_called` so a CMO can sanity-check that traffic is actually flowing.

## Architecture at a glance

```
Client ──▶ Zuplo Gateway ──▶ POST /v1/flags/{key}/decide
                                       │
                       ┌───────────────┴────────────────┐
                       ▼                                ▼
            PostHog /decide              Local consistent-hash
            (when configured)            (rollout % or experiment variants)
                       │                                │
                       └────────────┬───────────────────┘
                                    ▼
                       PostHog /capture  ($feature_flag_called)
                                    ▼
                       Repository (Supabase / Firestore / Neon / Upstash)

Client ──▶ POST /event ──▶ local repo + PostHog /capture (event mirror)
Agent  ──▶ /interpret-results ──▶ local results + HogQL exposure counts
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/ab-testing-flags
cd ab-testing-flags
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

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need:

- `POSTHOG_API_KEY` (project key, `phc_…`) — enables `/decide` cascade and event mirroring
- `POSTHOG_PERSONAL_API_KEY` (personal key, `phx_…`) — required for HogQL `/query` and the feature flag REST API
- `POSTHOG_PROJECT_ID` — required for HogQL `/query` and feature flag mirroring
- `POSTHOG_API_HOST` — defaults to `https://us.i.posthog.com`; use the EU host or your self-host base URL as needed

PostHog is optional. If you don't set credentials, the kit falls back to local-only flag delivery and skips event mirroring + HogQL queries.

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| GET | `/assignment/{id}` | `get_assignment` | Sticky variant assignment for a user (consistent hash) | tool |
| POST | `/event` | `record_event` | Record a conversion event (local + PostHog mirror) | tool |
| POST | `/experiment` | `create_experiment` | Create an experiment (optionally mirror to PostHog) | tool |
| GET | `/experiment/{id}` | `get_experiment` | Get an experiment | tool |
| POST | `/experiment/{id}/complete` | `complete_experiment` | Complete an experiment | tool |
| POST | `/experiment/{id}/pause` | `pause_experiment` | Pause an experiment | tool |
| POST | `/experiment/{id}/start` | `start_experiment` | Start an experiment | tool |
| GET | `/experiments` | `list_experiments` | List experiments | tool |
| POST | `/flag` | `create_flag` | Create a flag | tool |
| PATCH | `/flag/{id}` | `update_flag` | Update a flag | tool |
| GET | `/flags` | `list_flags` | List flags | tool |
| **POST** | **`/v1/flags/{key}/decide`** | **`decide_flag`** | **Resolve a flag for a user (PostHog or local)** | **tool** |
| POST | `/interpret-results` | `interpret_results` | Interpret results + PostHog exposure counts | tool |
| POST | `/kill-underperforming-variant` | `kill_underperforming_variant` | Kill a losing variant | tool |
| POST | `/propose-experiment-for-metric` | `propose_experiment_for_metric` | Propose an experiment | tool |
| GET | `/results` | `list_results` | List results | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `decide_flag` | repo, PostHog /decide, PostHog /capture | Resolve a flag value for a user |
| `record_event` | repo, PostHog /capture | Record a metric event and mirror to PostHog |
| `create_experiment` | repo, PostHog feature_flags REST | Create + (optionally) mirror as a multivariate PostHog flag |
| `interpret_results` | repo, PostHog HogQL | Lift / significance / recommendation + live exposure counts |
| `kill_underperforming_variant` | repo | Drop weight to 0 on losers |
| `propose_experiment_for_metric` | repo | Suggest a hypothesis + variants for a metric |
| `get_assignment`, `list_experiments`, etc. | repo | Standard CRUD |

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

`decide_flag` is the kit's headline. Calling `POST /v1/flags/my_flag/decide` with `{ distinctId: "u_123" }` returns a typed `{ value, payload, source }` envelope where `source` is `posthog`, `local-rollout`, `local-experiment`, or `local-default`. That gives you a single delivery plane that's compatible with PostHog dashboards but not handcuffed to them — flip a flag's source over to local for an outage, mirror it back when you're ready, run an A/B on the decision plane itself with `forcePostHog: true`. Combined with `interpret_results`, an agent can answer "did variant B lift conversion in the last 7 days, and are people actually being bucketed into it?" by reading both your kit's results table and a live HogQL count of `$feature_flag_called` events — without bouncing the operator between two tools.

## Extending

- **Swap PostHog for a different flag delivery system:** replace `modules/integrations/posthog.ts` with `growthbook.ts`, `unleash.ts`, etc. — keep the function signatures and `decide-flag.ts` doesn't change.
- **Pin a flag to PostHog:** set `localFlag.source = "posthog"` (an open-ended string field on the flag entity) so `decide_flag` always asks PostHog first.
- **Run on Vercel Flags as well:** add a small adapter that reads from Vercel Flags' precomputation cache and short-circuits `decide_flag` when the request carries a precomputed token.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.

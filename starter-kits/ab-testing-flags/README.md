# A/B Testing & Feature Flag API

Experiments, variants, flags, and assignments with MCP tools that interpret results, kill underperforming variants, and propose experiments.

**Replaces:** Optimizely, LaunchDarkly, Statsig.
**SEO target:** "self-hosted feature flag api".

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

See [env.example](./env.example).

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| GET | `/assignment/{id}` | `get_assignment` | Get Assignment | tool |
| POST | `/event` | `record_event` | Record Event | tool |
| POST | `/experiment` | `create_experiment` | Create Experiment | tool |
| GET | `/experiment/{id}` | `get_experiment` | Get Experiment | tool |
| POST | `/experiment/{id}/complete` | `complete_experiment` | Complete Experiment | tool |
| POST | `/experiment/{id}/pause` | `pause_experiment` | Pause Experiment | tool |
| POST | `/experiment/{id}/start` | `start_experiment` | Start Experiment | tool |
| GET | `/experiments` | `list_experiments` | List Experiments | tool |
| POST | `/flag` | `create_flag` | Create Flag | tool |
| PATCH | `/flag/{id}` | `update_flag` | Update Flag | tool |
| GET | `/flags` | `list_flags` | List Flags | tool |
| POST | `/interpret-results` | `interpret_results` | Interpret Results | tool |
| POST | `/kill-underperforming-variant` | `kill_underperforming_variant` | Kill Underperforming Variant | tool |
| POST | `/propose-experiment-for-metric` | `propose_experiment_for_metric` | Propose Experiment For Metric | tool |
| GET | `/results` | `list_results` | List Results | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

15 tools registered: `complete_experiment`, `create_experiment`, `create_flag`, `get_assignment`, `get_experiment`, `list_experiments`, `list_flags`, `list_results`, `pause_experiment`, `record_event`, `start_experiment`, `update_flag`, `interpret_results`, `kill_underperforming_variant`, `propose_experiment_for_metric`.

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

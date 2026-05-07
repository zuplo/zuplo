# Incident & Change Management API

Incidents, changes, postmortems, and on-call with MCP tools that summarize timelines, assess change risk, and find current on-call.

**Replaces:** PagerDuty incidents, ServiceNow Change, FireHydrant.
**SEO target:** "incident management api".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/incident-change-management
cd incident-change-management
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
| POST | `/assess-change-risk` | `assess_change_risk` | Assess Change Risk | tool |
| POST | `/change/{id}/approve` | `approve_change` | Approve Change | tool |
| POST | `/change/{id}/complete` | `complete_change` | Complete Change | tool |
| POST | `/change/{id}/reject` | `reject_change` | Reject Change | tool |
| GET | `/changes` | `list_changes` | List Changes | tool |
| POST | `/current-oncall-for-service` | `current_oncall_for_service` | Current Oncall For Service | tool |
| POST | `/declare-incident` | `declare_incident` | Declare Incident | tool |
| POST | `/draft-postmortem` | `draft_postmortem` | Draft Postmortem | tool |
| GET | `/incident/{id}` | `get_incident` | Get Incident | tool |
| GET | `/incidents` | `list_incidents` | List Incidents | tool |
| GET | `/oncall-schedule` | `list_oncall_schedule` | List Oncall Schedule | tool |
| POST | `/post-incident-update` | `post_incident_update` | Post Incident Update | tool |
| POST | `/postmortem/{id}/publish` | `publish_postmortem` | Publish Postmortem | tool |
| GET | `/postmortems` | `list_postmortems` | List Postmortems | tool |
| POST | `/propose-change` | `propose_change` | Propose Change | tool |
| POST | `/resolve-incident` | `resolve_incident` | Resolve Incident | tool |
| POST | `/summarize-timeline` | `summarize_timeline` | Summarize Timeline | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

17 tools registered: `approve_change`, `complete_change`, `declare_incident`, `draft_postmortem`, `get_incident`, `list_changes`, `list_incidents`, `list_oncall_schedule`, `list_postmortems`, `post_incident_update`, `propose_change`, `publish_postmortem`, `reject_change`, `resolve_incident`, `assess_change_risk`, `current_oncall_for_service`, `summarize_timeline`.

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

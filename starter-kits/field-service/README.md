# Field Service / Inspection API

Jobs, technicians, inspections, and invoices with MCP tools that optimize routes, flag recurring failures at sites, and draft estimates from inspections.

**Replaces:** ServiceTitan, Jobber, Housecall Pro.
**SEO target:** "api for field service".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/field-service
cd field-service
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
| POST | `/checklists` | `submit_checklist` | Submit a checklist | tool |
| GET | `/customers` | `list_customers` | List customers | tool |
| POST | `/customers` | `create_customer` | Create a customer | tool |
| POST | `/draft-estimate-from-inspection` | `draft_estimate_from_inspection` | Draft an estimate from an inspection (orchestrator) | tool |
| POST | `/flag-recurring-failures-at-site` | `flag_recurring_failures_at_site` | Flag recurring inspection failures at a site (orchestrator) | tool |
| POST | `/inspections` | `submit_inspection` | Submit an inspection | tool |
| GET | `/invoices` | `list_invoices` | List job invoices | tool |
| POST | `/invoices` | `create_invoice` | Create a job invoice | tool |
| GET | `/jobs` | `list_jobs` | List jobs in the current tenant | tool |
| POST | `/jobs` | `create_job` | Create a job | tool |
| GET | `/jobs/{id}` | `get_job` | Get a job by id | tool |
| POST | `/jobs/{id}/complete` | `complete_job` | Mark a job complete | tool |
| POST | `/optimize-route-for-day` | `optimize_route_for_day` | Optimize route for a technician's day (orchestrator) | tool |
| POST | `/photos` | `upload_photo` | Attach a photo to a job | tool |
| GET | `/technicians` | `list_technicians` | List technicians | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

15 tools registered: `list_jobs`, `create_job`, `get_job`, `complete_job`, `list_customers`, `create_customer`, `list_technicians`, `submit_inspection`, `upload_photo`, `submit_checklist`, `list_invoices`, `create_invoice`, `optimize_route_for_day`, `flag_recurring_failures_at_site`, `draft_estimate_from_inspection`.

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

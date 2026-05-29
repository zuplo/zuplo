# Sales Engagement / Cadence Starter Kit

Headless API for outbound sales engagement. Replaces Outreach, SalesLoft, and Apollo sequences.

## Quickstart

```bash
cd starter-kits/sales-engagement-cadence
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
| `supabase` | Supported |
| `firestore` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example). The kit boots with `DB_PROVIDER=in-memory` if no env vars are set.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cadences` | List cadences |
| POST | `/cadences` | Create cadence |
| GET | `/cadences/{id}` | Get cadence |
| GET | `/prospects` | List prospects |
| POST | `/prospects` | Create prospect |
| GET | `/enrollments` | List enrollments |
| POST | `/enrollments` | Enroll prospect |
| PATCH | `/enrollments/{id}/pause` | Pause enrollment |
| POST | `/enrollments/{id}/complete-step` | Complete step |
| GET | `/emails` | List emails |
| POST | `/personalize-step-for-prospect` | Orchestrator |
| POST | `/daily-task-brief` | Orchestrator |
| POST | `/pause-engaged-replies` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_cadences` | tool | yes | List cadences |
| `get_cadence` | tool | yes | Get cadence |
| `create_cadence` | tool | no | Create cadence |
| `list_prospects` | tool | yes | List prospects |
| `create_prospect` | tool | no | Create prospect |
| `list_enrollments` | tool | yes | List enrollments |
| `enroll_prospect` | tool | no | Enroll prospect |
| `pause_enrollment` | tool | no | Pause enrollment |
| `complete_step` | tool | no | Mark step done |
| `list_emails` | tool | yes | List emails |
| `personalize_step_for_prospect` | tool | yes | Render step (orchestrator) |
| `daily_task_brief` | tool | yes | Rep day brief (orchestrator) |
| `pause_engaged_replies` | tool | no | Auto-pause replied (orchestrator) |

## The AI angle

The three orchestrators turn the cadence into a self-managing engagement loop. `personalize_step_for_prospect` reads the enrollment, parent cadence, and prospect, then renders the next step's template — output is a ready-to-send subject + body. `daily_task_brief` builds a per-rep agenda overdue-first. `pause_engaged_replies` watches the email log and pauses any active enrollment whose prospect responded, so the rep takes over manually.

## Extending

- **New entity:** add the entity in `modules/repositories/`, update the OpenAPI schema.
- **New endpoint:** create a handler, add the route with `mcp: { type: "tool" }`, register in `/mcp` `operations`.
- **New orchestrator:** add to `modules/mcp-tools/` using `invokeJson` from `@zuplo/starter-kit-shared/mcp`.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

# Employee Onboarding API

A Zuplo Starter Kit that ships an onboarding API — hires, task templates, and per-hire checklists — together with an MCP server so an agent can spin up an onboarding plan, surface overdue work, and draft buddy notifications without leaving the chat.

Replaces: Sapling, ChartHop onboarding, Workday onboarding.

## Quickstart

```bash
cd starter-kits/employee-onboarding
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
| `neon` | Supported |
| `upstash-redis` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example).

The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke-test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/hires` | List hires |
| POST | `/hires` | Create a hire |
| GET | `/hires/{id}` | Get a hire |
| GET | `/tasks` | List onboarding tasks (filter by hireId, status, owner, category) |
| POST | `/tasks` | Create a task |
| PATCH | `/tasks/{id}/complete` | Mark a task done |
| GET | `/templates` | List onboarding templates |
| POST | `/templates` | Create an onboarding template |
| POST | `/create-onboarding-plan` | Orchestrator: materialise a template into tasks |
| POST | `/check-overdue-tasks` | Orchestrator: overdue tasks grouped by owner |
| POST | `/notify-buddy` | Orchestrator: draft a buddy notification |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_hires` | tool | yes | List hires |
| `get_hire` | tool | yes | Get a hire |
| `create_hire` | tool | no | Create a hire |
| `list_tasks` | tool | yes | List tasks |
| `create_task` | tool | no | Create a task |
| `complete_task` | tool | idempotent | Mark a task done |
| `list_templates` | tool | yes | List templates |
| `create_template` | tool | no | Create a template |
| `create_onboarding_plan` | tool | no | Spin up tasks from a template (orchestrator) |
| `check_overdue_tasks` | tool | yes | Overdue tasks grouped by owner (orchestrator) |
| `notify_buddy` | tool | yes | Draft a buddy notification (orchestrator) |

## The AI angle

Three orchestrators do the work that nobody enjoys.

`create_onboarding_plan` is the one. Reading a template and producing a calendar of tasks for a specific hire used to be ten minutes of copy-paste in a spreadsheet — here it's a single MCP call. The orchestrator schedules each task at `hire.startDate + daysFromStart` and resolves the dependsOnTitles graph in a second pass.

`check_overdue_tasks` answers "what's slipping?" without forcing the user to scan rows. The result is grouped by `ownerEmail` so an agent can chase the right people in one round of DMs.

`notify_buddy` returns a *draft* notification — it intentionally does not send email. An agent reviews and dispatches via its own email tool.

## Extending

- **Real email send:** add an outbound webhook policy on `notify_buddy` (or wire it to your transactional-email vendor) to actually send the draft.
- **Slack notifications:** add a sibling orchestrator `notify_manager` that posts a daily digest to a Slack channel for managers with overdue tasks.
- **Smart due dates:** factor in non-business days when materialising a plan — `daysFromStart` is currently a raw calendar offset.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

# Time Tracking & Timesheet API

A Zuplo Starter Kit that ships a fully-tenanted time tracking API with project rollups and weekly timesheets — together with an MCP server so agents can submit timesheets and surface unbilled hours through plain HTTP or MCP tools.

Replaces: Harvest, Toggl, Clockify.

## Quickstart

```bash
cd starter-kits/time-tracking
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
| GET | `/time-entries` | List time entries (filter by employee, project, status, billable, date) |
| POST | `/time-entries` | Log a new time entry (status=draft) |
| GET | `/time-entries/{id}` | Get a time entry |
| PATCH | `/time-entries/{id}` | Update a time entry |
| DELETE | `/time-entries/{id}` | Delete a time entry |
| GET | `/projects` | List projects |
| POST | `/projects` | Create a project |
| GET | `/timesheets` | List timesheets |
| POST | `/submit-weekly-timesheet` | Orchestrator: roll up a week into a Timesheet |
| POST | `/find-unbilled-hours` | Orchestrator: tracked-but-not-yet-billed hours by project |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_time_entries` | tool | yes | List time entries with filters |
| `get_time_entry` | tool | yes | Get a time entry by id |
| `create_time_entry` | tool | no | Log a time entry (draft) |
| `update_time_entry` | tool | idempotent | Update a time entry |
| `delete_time_entry` | tool | destructive | Delete a draft time entry |
| `list_projects` | tool | yes | List projects |
| `create_project` | tool | no | Create a project |
| `list_timesheets` | tool | yes | List weekly timesheets |
| `submit_weekly_timesheet` | tool | no | Roll a week's entries into a submitted Timesheet (orchestrator) |
| `find_unbilled_hours` | tool | yes | Billable draft entries grouped by project (orchestrator) |

## The AI angle

The two orchestrator tools — `submit_weekly_timesheet` and `find_unbilled_hours` — turn an assistant into a finance helper. "Submit my hours for last week" becomes a single MCP call that pulls every entry, sums the duration, and creates the timesheet record. "Where's the missing revenue this month?" becomes one call that returns billable work nobody's submitted yet, grouped by project. Both tools call `list_time_entries` through `context.invokeRoute()`, so they automatically inherit tenant scoping, auth, and rate limits.

## Extending

- **Approval workflow:** add an `approve_timesheet` PATCH route that updates the Timesheet's status and back-fills the approvedAt on every linked TimeEntry.
- **Invoicing integration:** add an outbound webhook on `submit_weekly_timesheet` to fire a Stripe invoice or QuickBooks bill.
- **Weekly digest tool:** add another orchestrator that returns hours-by-project for a given week, ready to paste into a Slack standup.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

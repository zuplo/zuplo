# Time Tracking & Timesheet API

A Zuplo Starter Kit for time tracking with project rollups, weekly timesheets, and an MCP server that does the boring follow-up work for you: walks unbilled hours, drafts a friendly nudge email per employee with Claude, and ships it via Resend.

Replaces: Harvest, Toggl, Clockify.

## Wires up

- **Slack** (Web API or incoming webhook) — optional digests / alerts into a #timesheets channel
- **Resend** — sends the per-employee Friday-morning "submit your hours" nudge emails
- **Claude** (Anthropic Messages API, optionally routed through Zuplo AI Gateway) — drafts the nudge emails so each one is short, warm, and personalized to that person's unbilled breakdown

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Slack       (chat.postMessage / webhook)
                │                  ├── Resend      (per-employee email send)
                │                  └── Claude      (drafts each nudge body)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

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

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need:

- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — required to actually send nudges
- `ANTHROPIC_API_KEY` — drafts the body text (`AI_GATEWAY_URL` optional, routes through Zuplo AI Gateway)
- `SLACK_BOT_TOKEN` (or `SLACK_WEBHOOK_URL`) — only if you wire up Slack digests

The kit boots fine with `DB_PROVIDER=in-memory` and no integration creds. `chase_unbilled_hours` will simply return drafts (without sending) when Resend isn't configured, and Claude failures fall through to a hardcoded backup template so you never get a blank email.

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
| POST | `/chase-unbilled-hours` | Orchestrator: drafts (and optionally sends) one nudge email per employee |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Calls | Description |
|---|---|---|---|---|
| `list_time_entries` | tool | yes | DB | List time entries with filters |
| `get_time_entry` | tool | yes | DB | Get a time entry by id |
| `create_time_entry` | tool | no | DB | Log a time entry (draft) |
| `update_time_entry` | tool | idempotent | DB | Update a time entry |
| `delete_time_entry` | tool | destructive | DB | Delete a draft time entry |
| `list_projects` | tool | yes | DB | List projects |
| `create_project` | tool | no | DB | Create a project |
| `list_timesheets` | tool | yes | DB | List weekly timesheets |
| `submit_weekly_timesheet` | tool | no | DB | Roll a week's entries into a submitted Timesheet (orchestrator) |
| `find_unbilled_hours` | tool | yes | DB | Billable draft entries grouped by project (orchestrator) |
| `chase_unbilled_hours` | tool | no | DB + Claude + Resend | Drafts one personalized nudge per employee, sends via Resend (orchestrator) |

## The AI angle

`chase_unbilled_hours` is the headline. Pass `sendEmails: true` plus an `employeeEmails` map and the orchestrator walks every employee's draft, billable time entries, asks Claude (Sonnet 4.7) to write a short reminder personalized to that person's specific project breakdown, and dispatches it through Resend — returning the drafts and send results so you can audit the run. Pass `sendEmails: false` (the default) and you get the same drafts without anything leaving the building, ready for human review. The `find_unbilled_hours` tool is still there for read-only "what's outstanding?" queries.

## Extending

- **Swap Resend for Postmark / SES:** replace `modules/integrations/resend.ts`. The orchestrator code stays identical.
- **Daily Slack digest:** wire `postSlackMessage()` into `find_unbilled_hours` to post a top-of-list summary into a #timesheets channel each morning.
- **Approval workflow:** add an `approve_timesheet` PATCH route that updates the Timesheet's status and back-fills the approvedAt on every linked TimeEntry.
- **Invoicing integration:** add an outbound webhook on `submit_weekly_timesheet` to fire a Stripe invoice or QuickBooks bill.
- **Route Claude through Zuplo's AI Gateway:** set `AI_GATEWAY_URL` and every Claude call inherits caching, budgets, and prompt-injection scanning.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

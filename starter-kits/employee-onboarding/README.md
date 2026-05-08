# Employee Onboarding API

A Zuplo Starter Kit that handles new hires the way new hires should be handled — Slack DMs to the buddy with their first-week checklist, Claude-drafted 30/60/90 plans tailored to the role, Resend emails for paperwork. The MCP server turns "Maria starts Monday — set her up" into one command.

Replaces: Sapling, ChartHop onboarding, Workday onboarding.

## Wires up

- **Slack** (Web API: `users.lookupByEmail` + `conversations.open` + `chat.postMessage`) — DMs the buddy with the new hire's first-week checklist
- **Resend** — outbound transactional email (welcome notes, paperwork reminders, day-1 confirmations)
- **Claude** (Anthropic Messages API, optionally routed through Zuplo AI Gateway) — drafts a 30/60/90 plan tailored to the hire's role and level

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Slack       (lookup + DM the buddy)
                │                  ├── Resend      (welcome / paperwork emails)
                │                  └── Claude      (30/60/90 plan generator)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

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

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `SLACK_BOT_TOKEN` (with `chat:write`, `im:write`, `users:read.email`) — required for `notify_buddy` to actually DM
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — outbound email
- `ANTHROPIC_API_KEY` — `create_onboarding_plan` 30/60/90 generation (`AI_GATEWAY_URL` optional)

The kit boots fine with `DB_PROVIDER=in-memory` and no integration creds. `notify_buddy` supports `dryRun: true` for testing without sending.

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
| POST | `/create-onboarding-plan` | Orchestrator: materialise a template into tasks (+ optional 30/60/90) |
| POST | `/check-overdue-tasks` | Orchestrator: overdue tasks grouped by owner |
| POST | `/notify-buddy` | Orchestrator: DM the buddy with the first-week checklist |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Calls | Description |
|---|---|---|---|---|
| `list_hires` | tool | yes | DB | List hires |
| `get_hire` | tool | yes | DB | Get a hire |
| `create_hire` | tool | no | DB | Create a hire |
| `list_tasks` | tool | yes | DB | List tasks |
| `create_task` | tool | no | DB | Create a task |
| `complete_task` | tool | idempotent | DB | Mark a task done |
| `list_templates` | tool | yes | DB | List templates |
| `create_template` | tool | no | DB | Create a template |
| `create_onboarding_plan` | tool | no | DB + Claude (optional) | Materialise a template; optionally generate a 30/60/90 plan (orchestrator) |
| `check_overdue_tasks` | tool | yes | DB | Overdue tasks grouped by owner (orchestrator) |
| `notify_buddy` | tool | no | DB + Slack | DM the buddy with the first-week checklist (orchestrator) |

## The AI angle

`notify_buddy` and `create_onboarding_plan` are the headline tools.

- **`notify_buddy`** resolves the buddy's Slack user from their email address, opens a DM channel with `conversations.open`, and posts a formatted first-week checklist with the new hire's buddy-category tasks. Pass `dryRun: true` and you get the message text without actually posting — useful for review.
- **`create_onboarding_plan`** still spins up the per-hire task list from a template (the original orchestrator), but with `generate306090: true` it also asks Claude to draft a tailored 30/60/90 plan from the hire's role + level + team context. Manager pastes that into the new hire's first 1:1 doc and skips an hour of writing.

`check_overdue_tasks` answers "what's slipping?" — group results by `ownerEmail` so an agent can chase the right people.

## Extending

- **Welcome email on day -1:** add an outbound webhook policy on `create_hire` to fire a Resend welcome email automatically.
- **Slack channel announcement:** add a `#welcome` post for every new hire on day 1 by extending `create_onboarding_plan` to also `postSlackMessage()` to a default channel.
- **Manager digest:** add a sibling orchestrator that runs `check_overdue_tasks` and posts a digest to the manager's DM each Monday.
- **Smart due dates:** factor in non-business days when materialising a plan — `daysFromStart` is currently a raw calendar offset.
- **Swap Slack for Microsoft Teams:** replace `modules/integrations/slack.ts` with a Teams Graph API caller.
- **Route Claude through Zuplo's AI Gateway:** set `AI_GATEWAY_URL`.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

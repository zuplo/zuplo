# Task / Project Management API

Projects, tasks, subtasks, comments, and labels — wired to Slack for assignment + status notifications and to Google Calendar for due-date events. MCP orchestrators chase stale work, summarize sprints, and rebalance load.

Replaces: Asana, Trello, Linear (the data layer + the notification glue).

## Wires up

Slack delivers human-visible signal — every task assignment, status flip, and stale-task nudge posts to your team channel via either an incoming webhook or a bot token. Google Calendar receives a "task due" event the moment a task with a due date is created so the assignee sees it in their day. The orchestrator MCP tools (`chase_stale_tasks`, `summarize_sprint`, `rebalance_workload`) read across projects/tasks/labels and shape the result for an LLM caller, then post the action to Slack when asked.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Handlers (CRUD)         ──▶ DB adapter (Supabase / Firestore / Neon / Upstash)
                │                  │
                │                  └──▶ Integrations
                │                         ├── Slack (chat.postMessage / webhook)
                │                         └── Google Calendar (events.insert)
                ▼
         /mcp ──▶ MCP server ──▶ orchestrator tools (invokeRoute over /tasks, /projects, …)
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/task-project-management
cd task-project-management
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

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need credentials for the integrations:

- **Slack** — `SLACK_WEBHOOK_URL` (simplest) or `SLACK_BOT_TOKEN` + `SLACK_DEFAULT_CHANNEL`.
- **Google Calendar** — `GOOGLE_CALENDAR_ACCESS_TOKEN` (OAuth2 access token, refresh externally) and optional `GOOGLE_CALENDAR_ID`.

If those vars are absent the handlers still run; the integration call is logged as a warning and the API returns the created/updated task as normal.

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| POST | `/chase-stale-tasks` | `chase_stale_tasks` | Chase Stale Tasks | tool |
| POST | `/comment` | `create_comment` | Create Comment | tool |
| GET | `/comments` | `list_comments` | List Comments | tool |
| POST | `/label` | `create_label` | Create Label | tool |
| GET | `/labels` | `list_labels` | List Labels | tool |
| POST | `/project` | `create_project` | Create Project | tool |
| GET | `/project/{id}` | `get_project` | Get Project | tool |
| POST | `/project/{id}/archive` | `archive_project` | Archive Project | tool |
| GET | `/projects` | `list_projects` | List Projects | tool |
| POST | `/rebalance-workload` | `rebalance_workload` | Rebalance Workload | tool |
| POST | `/subtask` | `create_subtask` | Create Subtask | tool |
| POST | `/subtask/{id}/complete` | `complete_subtask` | Complete Subtask | tool |
| GET | `/subtasks` | `list_subtasks` | List Subtasks | tool |
| POST | `/summarize-sprint` | `summarize_sprint` | Summarize Sprint | tool |
| POST | `/task` | `create_task` | Create Task | tool |
| DELETE | `/task/{id}` | `delete_task` | Delete Task | tool |
| GET | `/task/{id}` | `get_task` | Get Task | tool |
| PATCH | `/task/{id}` | `update_task` | Update Task | tool |
| POST | `/task/{id}/complete` | `complete_task` | Complete Task | tool |
| GET | `/tasks` | `list_tasks` | List Tasks | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| CRUD: `archive_project`, `complete_subtask`, `complete_task`, `create_comment`, `create_label`, `create_project`, `create_subtask`, `create_task`, `delete_task`, `get_project`, `get_task`, `list_comments`, `list_labels`, `list_projects`, `list_subtasks`, `list_tasks`, `update_task` | DB adapter | Standard reads/writes. `create_task` and `update_task` also call Slack and Google Calendar. |
| `chase_stale_tasks` | DB + Slack | Finds tasks stuck in `doing`/`blocked` past `daysWithoutActivity`. With `dispatch=true`, posts grouped nudges to Slack — one message per assignee. |
| `summarize_sprint` | DB | One-call sprint snapshot — counts by status, top blockers, recent comments. |
| `rebalance_workload` | DB | Suggests reassignments where one teammate carries >2× another's effort. |

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

`chase_stale_tasks` is the headline. Run it from a Claude Desktop session, an internal cron-via-webhook, or your own UI: it reads the task list, identifies what's been ignored, drafts a per-person nudge, and (when `dispatch=true`) actually posts to Slack — all from one MCP tool call. Pair with `summarize_sprint` to brief a standup, and `rebalance_workload` to suggest who picks up what when somebody is overloaded.

`create_task` does the unglamorous but indispensable side of the same loop: when a task with a `dueDate` is created, the kit drops a Google Calendar event onto the assignee's calendar, attendees attached. Cancel the silent fan-out by passing `silent: true` in the request body.

## Extending

- **Swap Slack for Discord/Teams**: replace `modules/integrations/slack.ts` with one that hits `https://discord.com/api/webhooks/...` or `https://graph.microsoft.com/v1.0/teams/...`. The handler's `sendSlackMessage(...)` call is a single function.
- **Calendar provider**: swap `modules/integrations/google-calendar.ts` for an Outlook/Microsoft Graph version. Same shape, different URL.
- **New entity**: add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **New endpoint**: add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **New orchestrator MCP tool**: drop a file in `modules/mcp-tools/` that uses `invokeJson` from `@zuplo/starter-kit-shared/mcp` to compose existing endpoints. Pass the inbound `authorization` header through so the inner calls re-run policies.
- **Switch databases**: change `DB_PROVIDER` in `.env` — the handlers don't change.

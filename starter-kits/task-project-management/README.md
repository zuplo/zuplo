# Task / Project Management API

Projects, tasks, subtasks, comments, and labels with MCP tools that summarize sprints, chase stale tasks, and rebalance workload.

**Replaces:** Asana, Trello, Linear.
**SEO target:** "api for task management".

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

See [env.example](./env.example).

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

20 tools registered: `archive_project`, `complete_subtask`, `complete_task`, `create_comment`, `create_label`, `create_project`, `create_subtask`, `create_task`, `delete_task`, `get_task`, `update_task`, `get_project`, `list_comments`, `list_labels`, `list_projects`, `list_subtasks`, `list_tasks`, `chase_stale_tasks`, `rebalance_workload`, `summarize_sprint`.

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

The orchestrator MCP tools shipped with this kit are where the agentic value compounds — they read multi-source signals through `context.invokeRoute()` and shape the response for an LLM, rather than dumping raw rows. Agents work best when they can call a few purposeful tools (`triage_x`, `summarize_x`, `flag_x`) instead of every CRUD endpoint.

Per the [conventions doc](../CLAUDE.md), every CRUD endpoint inherits `api-key-inbound` + `rate-limit` policies, and the `/mcp` route adds `prompt-injection-outbound` + `secret-masking-outbound` defenses for AI traffic.

## Extending

- **New entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **New endpoint:** add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **New orchestrator MCP tool:** drop a file in `modules/mcp-tools/` that uses `invokeJson` from `@zuplo/starter-kit-shared/mcp` to compose existing endpoints. Pass the inbound `authorization` header through so the inner calls re-run policies.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.

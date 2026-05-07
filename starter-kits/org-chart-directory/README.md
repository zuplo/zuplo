# Org Chart & People Directory API

Headless org chart and people directory backed by an MCP server. Stand up an internal "who reports to whom" service in minutes, with API key auth, multi-tenancy, and a curated MCP toolset for LLM agents.

Replaces: ChartHop, Pingboard, BambooHR's directory module.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/org-chart-directory
cd starter-kits/org-chart-directory
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

See [env.example](./env.example). The kit boots with `DB_PROVIDER=in-memory` and zero other env vars.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/people` | List people in tenant |
| POST | `/people` | Create a person |
| GET | `/people/{id}` | Get a person |
| PATCH | `/people/{id}` | Update a person |
| GET | `/teams` | List teams |
| POST | `/teams` | Create a team |
| GET | `/skills` | List skills |
| POST | `/person-skills` | Attach a skill to a person |
| POST | `/who-reports-to` | Orchestrator: build an N-deep reporting tree |
| POST | `/find-skip-level-reports` | Orchestrator: list skip-level reports |
| POST | `/find-owner-of-team` | Orchestrator: find a team's lead and members |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_people` | yes | List people |
| `get_person` | yes | Get a person by id |
| `create_person` | no | Add an employee |
| `update_person` | no (idempotent) | Title change, transfer, on_leave, etc. |
| `list_teams` | yes | List teams |
| `create_team` | no | Create a team |
| `list_skills` | yes | List the skills catalog |
| `add_person_skill` | no | Attach a skill at a level (1-5) |
| `who_reports_to` | yes | Build a reporting tree under a manager |
| `find_skip_level_reports` | yes | List skip-level reports for a manager |
| `find_owner_of_team` | yes | Find a team's lead and members |

## The AI angle

The orchestrator tools (`who_reports_to`, `find_skip_level_reports`, `find_owner_of_team`) are the value-add for an LLM. Instead of teaching an agent to paginate `/people` and stitch a graph together, the gateway does the walk and returns a tree. The agent grounds on small, structured payloads — fewer tokens, fewer hallucinations.

## Extending

- **New entity** (e.g. `Office`, `OnCallRotation`): add it to `modules/repositories/people.ts`, then add a CRUD route in `routes.oas.json`.
- **New orchestrator** (e.g. `find_open_seats_in_team`): drop a file in `modules/mcp-tools/`, register the operationId in the `/mcp` operations array.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

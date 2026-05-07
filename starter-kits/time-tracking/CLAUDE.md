# Time Tracking & Timesheet Kit

A Zuplo Starter Kit for time tracking, project rollups, and weekly timesheets. Replaces Harvest, Toggl, and Clockify.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Routes + MCP annotations (Layer 1) + `/mcp` operations array (Layer 2) |
| `config/policies.json` | api-key-inbound, rate-limit, prompt-injection-outbound, secret-masking-outbound |
| `modules/repositories/time-entries.ts` | TimeEntry entity + repository |
| `modules/repositories/projects.ts` | Project entity + repository |
| `modules/repositories/timesheets.ts` | Timesheet entity + repository |
| `modules/handlers/*.ts` | One file per CRUD endpoint |
| `modules/mcp-tools/submit-weekly-timesheet.ts` | Orchestrator MCP tool |
| `modules/mcp-tools/find-unbilled-hours.ts` | Orchestrator MCP tool |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/time-entries` | List time entries |
| POST | `/time-entries` | Create time entry (draft) |
| GET | `/time-entries/{id}` | Get a time entry |
| PATCH | `/time-entries/{id}` | Update a time entry |
| DELETE | `/time-entries/{id}` | Delete a time entry |
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/timesheets` | List timesheets |
| POST | `/submit-weekly-timesheet` | Orchestrator |
| POST | `/find-unbilled-hours` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrator rationale

`submit_weekly_timesheet` is the kit's headline AI tool. The end-of-week ritual ("paste hours into Harvest") becomes a single MCP call — the orchestrator iterates `list_time_entries` for the week through `context.invokeRoute`, sums total minutes, and writes a Timesheet row in `submitted` status. Tenant + auth scoping stays intact because the orchestrator always re-enters through the public route.

`find_unbilled_hours` answers the finance team's recurring question: "what billable work haven't we billed for yet?" By definition every draft+billable entry is unbilled (it isn't on a timesheet), so the orchestrator filters on those, groups by project, and returns the totals.

## Verifying the kit boots

```bash
cp env.example .env
npm install
npm run dev
# In another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

The Inspector should show 10 tools: `list_time_entries`, `get_time_entry`, `create_time_entry`, `update_time_entry`, `delete_time_entry`, `list_projects`, `create_project`, `list_timesheets`, `submit_weekly_timesheet`, `find_unbilled_hours`.

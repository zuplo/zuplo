# Task / Project Management API

Projects, tasks, subtasks, comments, and labels with MCP tools that summarize sprints, chase stale tasks, and rebalance workload.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/chase-stale-tasks` | `chase_stale_tasks` | tool |
| POST | `/comment` | `create_comment` | tool |
| GET | `/comments` | `list_comments` | tool |
| POST | `/label` | `create_label` | tool |
| GET | `/labels` | `list_labels` | tool |
| POST | `/project` | `create_project` | tool |
| GET | `/project/{id}` | `get_project` | tool |
| POST | `/project/{id}/archive` | `archive_project` | tool |
| GET | `/projects` | `list_projects` | tool |
| POST | `/rebalance-workload` | `rebalance_workload` | tool |
| POST | `/subtask` | `create_subtask` | tool |
| POST | `/subtask/{id}/complete` | `complete_subtask` | tool |
| GET | `/subtasks` | `list_subtasks` | tool |
| POST | `/summarize-sprint` | `summarize_sprint` | tool |
| POST | `/task` | `create_task` | tool |
| DELETE | `/task/{id}` | `delete_task` | tool |
| GET | `/task/{id}` | `get_task` | tool |
| PATCH | `/task/{id}` | `update_task` | tool |
| POST | `/task/{id}/complete` | `complete_task` | tool |
| GET | `/tasks` | `list_tasks` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

20 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `archive_project`
- `complete_subtask`
- `complete_task`
- `create_comment`
- `create_label`
- `create_project`
- `create_subtask`
- `create_task`
- `delete_task`
- `get_task`
- `update_task`
- `get_project`
- `list_comments`
- `list_labels`
- `list_projects`
- `list_subtasks`
- `list_tasks`
- `chase_stale_tasks`
- `rebalance_workload`
- `summarize_sprint`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 20 entries above.

## Replaces

- Asana
- Trello
- Linear

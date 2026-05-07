# Legal Matter Management Starter Kit

Headless matter management for law firms — clients, matters, documents, deadlines, time entries, conflict checks. See [../CLAUDE.md](../CLAUDE.md) for the conventions every kit follows.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clients` | List clients |
| GET | `/clients/{id}` | Get a client |
| POST | `/clients` | Create a client |
| GET | `/matters` | List matters |
| GET | `/matters/{id}` | Get a matter |
| POST | `/matters` | Open a matter |
| PATCH | `/matters/{id}/close` | Close a matter |
| GET | `/documents` | List documents |
| POST | `/documents` | Attach a document |
| GET | `/deadlines` | List deadlines |
| POST | `/deadlines` | Add a deadline |
| PATCH | `/deadlines/{id}/complete` | Mark deadline complete |
| GET | `/time-entries` | List time entries |
| POST | `/time-entries` | Log a time entry |
| GET | `/conflicts` | List conflict records |
| POST | `/conflicts` | Record a conflict check |
| POST | `/check-conflict-before-intake` | Orchestrator: intake conflict screen |
| POST | `/summarize-matter-status` | Orchestrator: matter status |
| POST | `/draft-status-letter-to-client` | Orchestrator: status letter draft |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Matter` — primary; lifecycle open -> in_progress -> on_hold -> closed
- `Client` — individual or organization with a conflicts list
- `MatterDocument` — file attached to a matter, with `privileged` flag
- `Deadline` — court / client / internal, with status upcoming/completed/missed
- `MatterTimeEntry` — billable or non-billable time
- `Conflict` — recorded conflict-check decision per prospect

## MCP tools registered

`list_clients`, `get_client`, `create_client`, `list_matters`, `get_matter`, `open_matter`, `close_matter`, `list_documents`, `upload_document`, `list_deadlines`, `add_deadline`, `complete_deadline`, `list_time_entries`, `log_time_entry`, `list_conflicts`, `run_conflict_check`, `check_conflict_before_intake`, `summarize_matter_status`, `draft_status_letter_to_client`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

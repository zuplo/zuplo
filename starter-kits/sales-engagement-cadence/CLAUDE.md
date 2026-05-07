# Sales Engagement / Cadence Starter Kit

Headless API for outbound sales engagement. Replaces Outreach, SalesLoft, Apollo sequences. See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Enrollment` | Prospect ↔ Cadence binding; the engagement state machine. |
| `Cadence` | Templated outbound sequence. |
| `Prospect` | The contact being engaged. |
| `Email` | One outbound message tied to a step. |
| `CadenceTask` | Manual step (call/task) the rep is expected to do. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cadences` | List |
| POST | `/cadences` | Create |
| GET | `/cadences/{id}` | Get |
| GET | `/prospects` | List |
| POST | `/prospects` | Create |
| GET | `/enrollments` | List |
| POST | `/enrollments` | Enroll |
| PATCH | `/enrollments/{id}/pause` | Pause |
| POST | `/enrollments/{id}/complete-step` | Step++ |
| GET | `/emails` | List |
| POST | `/personalize-step-for-prospect` | Orchestrator |
| POST | `/daily-task-brief` | Orchestrator |
| POST | `/pause-engaged-replies` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `personalize_step_for_prospect` — reads enrollment + parent cadence + prospect, renders the requested step template with `{{firstName}}`-style tokens.
- `daily_task_brief` — pending CadenceTasks for `repEmail`, sorted overdue-first.
- `pause_engaged_replies` — finds active enrollments where the prospect replied (via the Email log) and pauses them.

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.

# Customer Support Ticketing Starter Kit

Headless customer support API. Replaces Zendesk, Intercom, Freshdesk. See [../CLAUDE.md](../CLAUDE.md) for the conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Ticket` | Primary entity. The customer inquiry itself. |
| `Conversation` | A reply on a ticket. `kind: internal` is hidden from the customer. |
| `Macro` | A reusable canned reply that can be applied to a ticket. |
| `SLA` | Per-priority response/resolution targets. |
| `Customer` | The customer that opened the ticket, looked up by email. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets` | List tickets |
| POST | `/tickets` | Create a ticket |
| GET | `/tickets/{id}` | Get a ticket |
| PATCH | `/tickets/{id}` | Update fields |
| PATCH | `/tickets/{id}/assign` | Assign agent + move to open |
| POST | `/tickets/{id}/reply` | Add a public/internal reply |
| PATCH | `/tickets/{id}/close` | Close ticket |
| PATCH | `/tickets/{id}/reopen` | Reopen closed ticket |
| GET | `/macros` | List macros |
| POST | `/macros` | Create a macro |
| POST | `/apply-macro` | Apply a macro as a ticket reply |
| POST | `/triage-incoming-ticket` | Orchestrator: priority/tags/assignee |
| POST | `/escalate-with-summary` | Orchestrator: handoff summary |
| POST | `/summarize-recurring-issues` | Orchestrator: top recurring tags |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `triage_incoming_ticket` - reads a ticket, scores keywords against priority/tag dictionaries, looks at recent tickets sharing matching tags to pick a likely assignee.
- `escalate_with_summary` - pulls the ticket, every conversation, and the matching customer record (by email) and returns a chronological summary text.
- `summarize_recurring_issues` - lists tickets in a window, clusters by tag, returns top tags + sample subjects per tag.

## MCP tools registered

`list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `assign_ticket`, `reply_to_ticket`, `close_ticket`, `reopen_ticket`, `list_macros`, `create_macro`, `apply_macro`, `triage_incoming_ticket`, `escalate_with_summary`, `summarize_recurring_issues`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

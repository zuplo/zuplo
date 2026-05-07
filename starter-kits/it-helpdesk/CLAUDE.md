# IT Helpdesk / Ticketing Starter Kit

Headless internal IT helpdesk. Replaces Zendesk Internal, Freshservice, ServiceNow ITSM. See [../CLAUDE.md](../CLAUDE.md) for the conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `IncidentTicket` | Primary entity. The ticket itself. |
| `Comment` | A reply on a ticket. `kind: internal` is hidden from the requester. |
| `KBArticle` | A self-serve answer that may resolve the ticket. |
| `Category` | A ticket category with a default assignee. Used by triage. |
| `SLA` | Per-priority response/resolution targets. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets` | List tickets |
| POST | `/tickets` | Create a ticket |
| GET | `/tickets/{id}` | Get a ticket |
| PATCH | `/tickets/{id}` | Update fields |
| POST | `/tickets/{id}/assign` | Assign agent |
| PATCH | `/tickets/{id}/resolve` | Mark resolved |
| POST | `/tickets/{id}/close` | Close ticket |
| POST | `/tickets/{id}/reopen` | Reopen ticket |
| GET | `/comments` | List comments |
| POST | `/comments` | Add a comment |
| GET | `/kb-articles` | List KB articles |
| POST | `/kb-articles` | Create a KB article |
| GET | `/kb-articles/search?q=` | Search KB |
| POST | `/triage-ticket` | Orchestrator: triage |
| POST | `/suggest-kb-answer` | Orchestrator: KB matching |
| POST | `/escalate-breaching-sla` | Orchestrator: SLA risk |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `triage_ticket` - reads a ticket, scores keywords against a category/priority dictionary, and looks up the default assignee for the suggested category.
- `suggest_kb_answer` - extracts keywords from the ticket and fans out to `search_kb` for the top terms; returns ranked suggestions.
- `escalate_breaching_sla` - lists open tickets whose `slaBreachAt` falls within `minutesBefore` minutes from now.

## MCP tools registered

`list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `assign_ticket`, `resolve_ticket`, `close_ticket`, `reopen_ticket`, `list_comments`, `add_comment`, `list_kb_articles`, `create_kb_article`, `search_kb`, `triage_ticket`, `suggest_kb_answer`, `escalate_breaching_sla`. The same operationIds appear in both layers (route-level annotation and the `/mcp` `operations` array).

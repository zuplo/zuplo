# IT Helpdesk / Ticketing Starter Kit

Headless internal IT helpdesk and ticketing API. Replaces Zendesk Internal, Freshservice, and ServiceNow ITSM.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/it-helpdesk
cd starter-kits/it-helpdesk
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
| `in-memory` | Default - boots without any credentials |
| `supabase` | Supported |
| `firestore` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`.

## Environment variables

See [env.example](./env.example).

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets` | List incident tickets |
| POST | `/tickets` | Create a ticket |
| GET | `/tickets/{id}` | Get a ticket |
| PATCH | `/tickets/{id}` | Update a ticket |
| POST | `/tickets/{id}/assign` | Assign to an agent |
| PATCH | `/tickets/{id}/resolve` | Mark resolved |
| POST | `/tickets/{id}/close` | Close ticket |
| POST | `/tickets/{id}/reopen` | Reopen closed ticket |
| GET | `/comments` | List comments (filter by ticketId) |
| POST | `/comments` | Add a comment |
| GET | `/kb-articles` | List KB articles |
| POST | `/kb-articles` | Create a KB article |
| GET | `/kb-articles/search?q=` | Search KB |
| POST | `/triage-ticket` | Orchestrator: suggest category/priority/assignee |
| POST | `/suggest-kb-answer` | Orchestrator: KB matches for a ticket |
| POST | `/escalate-breaching-sla` | Orchestrator: tickets near SLA breach |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_tickets` | yes | List tickets in tenant |
| `get_ticket` | yes | Get ticket by id |
| `create_ticket` | no | Open a new ticket |
| `update_ticket` | no | Patch ticket fields |
| `assign_ticket` | no | Assign agent + move to in_progress |
| `resolve_ticket` | no | Mark resolved |
| `close_ticket` | no | Close ticket |
| `reopen_ticket` | no | Reopen closed ticket |
| `list_comments` | yes | List comments |
| `add_comment` | no | Add public/internal comment |
| `list_kb_articles` | yes | List KB articles |
| `create_kb_article` | no | Add a KB article |
| `search_kb` | yes | Substring search KB |
| `triage_ticket` | yes | Suggest category/priority/assignee |
| `suggest_kb_answer` | yes | Rank KB articles for a ticket |
| `escalate_breaching_sla` | yes | Tickets approaching SLA breach |

## The AI angle

Three orchestrators turn the API into an autonomous helpdesk: `triage_ticket` suggests category, priority, and assignee; `suggest_kb_answer` finds KB matches an agent can paste back; `escalate_breaching_sla` returns the prioritised list of tickets at risk of breach so an agent or human can page on-call. All run inside the gateway via `invokeRoute` so they inherit auth, rate limiting, and tenant scoping.

## Extending

- **Add a new ticket field:** edit `IncidentTicket` in `modules/repositories/tickets.ts` plus the OpenAPI schema in `routes.oas.json`.
- **Add a new orchestrator:** create a handler in `modules/mcp-tools/`, register the route + `mcp` annotation in `routes.oas.json`, and add the operationId to the `/mcp` operations array.
- **Switch databases:** change `DB_PROVIDER` in `.env`.

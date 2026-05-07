# Customer Support Ticketing Starter Kit

Headless customer support ticketing API. Tickets, conversations, macros, SLAs, and customers, with orchestrator MCP tools that triage incoming tickets, prepare escalation summaries, and surface recurring issues.

Replaces: Zendesk, Intercom, Freshdesk.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/support-ticketing
cd starter-kits/support-ticketing
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

The kit boots with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke test path is zero-config.

## API surface

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
| GET | `/macros` | List macros (canned replies) |
| POST | `/macros` | Create a macro |
| POST | `/apply-macro` | Apply a macro as a ticket reply |
| POST | `/triage-incoming-ticket` | Orchestrator: priority + tags + assignee |
| POST | `/escalate-with-summary` | Orchestrator: chronological handoff summary |
| POST | `/summarize-recurring-issues` | Orchestrator: top recurring tags |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_tickets` | yes | List tickets in tenant |
| `get_ticket` | yes | Get ticket by id |
| `create_ticket` | no | Open a new ticket |
| `update_ticket` | no | Patch ticket fields |
| `assign_ticket` | no | Assign agent + move to open |
| `reply_to_ticket` | no | Add public/internal reply |
| `close_ticket` | destructive | Close ticket |
| `reopen_ticket` | no | Reopen closed ticket |
| `list_macros` | yes | List macros |
| `create_macro` | no | Add a canned reply |
| `apply_macro` | no | Apply a macro to a ticket |
| `triage_incoming_ticket` | yes | Suggest priority/tags/assignee |
| `escalate_with_summary` | yes | Build chronological handoff summary |
| `summarize_recurring_issues` | yes | Cluster recent tickets by tag |

## The AI angle

Three orchestrators turn the API into an autonomous support function. `triage_incoming_ticket` reads a fresh ticket and returns a recommended priority, tag set, and the assignee most often handling similar tagged tickets. `escalate_with_summary` collapses a ticket plus every conversation entry plus the matching customer record into a single chronological summary text suitable for handoff to a senior agent. `summarize_recurring_issues` clusters recent tickets by tag and returns the top recurring complaints with sample subject lines so product can hear the same complaint once a week instead of forty times. All three run inside the gateway via `invokeRoute` and inherit auth, rate-limiting, and tenant scoping automatically.

## Extending

- **Add a ticket field:** edit `Ticket` in `modules/repositories/tickets.ts` and the OpenAPI schema in `routes.oas.json`.
- **Add a new orchestrator:** create a handler in `modules/mcp-tools/`, register the route + `mcp` annotation in `routes.oas.json`, and add the operationId to the `/mcp` operations array.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

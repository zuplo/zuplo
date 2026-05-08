# IT Helpdesk / Ticketing Starter Kit

A working internal IT helpdesk: tickets are triaged by Claude, the right engineer is DM'd in Slack, the requester gets a Resend email when they're updated, and a knowledge-base lookup drafts answers for tickets that look already-solved.

Replaces: Zendesk Internal, Freshservice, ServiceNow ITSM.

## Wires up

- **Claude** classifies category + priority on every new ticket (`triage_ticket`) and re-ranks KB candidates plus drafts a paste-ready response (`suggest_kb_answer`).
- **Slack** DMs the assigned engineer when `assign_ticket` runs (with channel-fallback when the user isn't on Slack).
- **Resend** emails the requester on assignment + resolution to keep them in the loop.

## Architecture at a glance

```
Employee opens ticket ─▶ POST /tickets
                              │
                              ▼
                    Zuplo Gateway (this kit)
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
 triage_ticket         suggest_kb_answer        assign_ticket
 (Claude classify)   (KB retrieve + Claude       (DB update + Slack DM
                      re-rank + draft)            + Resend update)
       │                      │                      │
       └────────► Database adapter ◄─────────────────┘
                  (in-memory / Supabase /
                   Firestore / Upstash / Neon)
```

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

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll want:

- **Slack** (`SLACK_BOT_TOKEN` or `SLACK_WEBHOOK_URL`) for assignee notifications
- **Claude** (`ANTHROPIC_API_KEY`) for triage + KB ranking
- **Resend** (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) for requester updates

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets` | List incident tickets |
| POST | `/tickets` | Create a ticket |
| GET | `/tickets/{id}` | Get a ticket |
| PATCH | `/tickets/{id}` | Update a ticket |
| POST | `/tickets/{id}/assign` | Assign to an agent + Slack DM |
| PATCH | `/tickets/{id}/resolve` | Mark resolved + email requester |
| POST | `/tickets/{id}/close` | Close ticket |
| POST | `/tickets/{id}/reopen` | Reopen closed ticket |
| GET | `/comments` | List comments (filter by ticketId) |
| POST | `/comments` | Add a comment |
| GET | `/kb-articles` | List KB articles |
| POST | `/kb-articles` | Create a KB article |
| GET | `/kb-articles/search?q=` | Search KB |
| POST | `/triage-ticket` | Orchestrator: Claude classifies category/priority/assignee |
| POST | `/suggest-kb-answer` | Orchestrator: KB ranking + Claude draft answer |
| POST | `/escalate-breaching-sla` | Orchestrator: tickets near SLA breach |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_tickets` | yes | DB | List tickets in tenant |
| `get_ticket` | yes | DB | Get ticket by id |
| `create_ticket` | no | DB | Open a new ticket |
| `update_ticket` | no | DB | Patch ticket fields |
| `assign_ticket` | no | DB + Slack | Assign + DM engineer |
| `resolve_ticket` | no | DB + Resend | Mark resolved + email requester |
| `close_ticket` | no | DB | Close ticket |
| `reopen_ticket` | no | DB | Reopen closed ticket |
| `list_comments` | yes | DB | List comments |
| `add_comment` | no | DB | Add public/internal comment |
| `list_kb_articles` | yes | DB | List KB articles |
| `create_kb_article` | no | DB | Add a KB article |
| `search_kb` | yes | DB | Substring search KB |
| `triage_ticket` | yes | Claude + DB | Suggest category/priority/assignee |
| `suggest_kb_answer` | yes | DB + Claude | Rank KB matches and draft an answer |
| `escalate_breaching_sla` | yes | DB | Tickets approaching SLA breach |

## The AI angle

`suggest_kb_answer` is the orchestrator that closes the loop. Given a ticket id, it:

1. Extracts keywords from the subject + body and hits `/kb-articles/search` for each (via `invokeRoute`, inheriting auth + tenant scoping).
2. Hands the candidate list to Claude, which picks the 1-3 articles that actually match and drafts a 1-2 sentence response the agent can paste back to the requester.
3. Returns honest confidence — when nothing fits, the agent gets `bestArticleIds: []` and `confidence: "low"` so they know to keep digging.

Combined with `triage_ticket` (Claude classification + auto-routing) and the Slack DM on `assign_ticket`, an agent's day collapses from "skim 40 inbound tickets" to "review the top of an already-prioritized queue with draft answers attached."

## Extending

- **Swap Resend for SES**: replace `modules/integrations/resend.ts` with an `aws-ses.ts` integration; only `assign-ticket.ts` and `resolve-ticket.ts` import it.
- **Replace Slack with Microsoft Teams**: swap `modules/integrations/slack.ts` for a Teams Incoming Webhook integration; the call sites use a single `dmSlackUserByEmail` / `postSlackMessage` shape that's easy to mirror.
- **Expand triage with company-specific rules**: edit the system prompt in `modules/mcp-tools/triage-ticket.ts` — add VIP requestor patterns, escalation policies, business-hours awareness.
- **Switch databases**: change `DB_PROVIDER` in `.env`.

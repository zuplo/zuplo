# Customer Support Ticketing Starter Kit

A real, runnable support function: inbound email becomes tickets, Claude triages them, agents are notified in Slack, and replies go back out as email — all behind one Zuplo gateway with MCP exposed.

Replaces: Zendesk, Intercom, Freshdesk.

## Wires up

- **Postmark** parses inbound customer email and POSTs the structured payload to `/webhooks/postmark/inbound`. The handler creates a ticket.
- **Claude** classifies category, suggests tags + priority + likely owner, and drafts a first reply (`triage_incoming_ticket` MCP tool).
- **Slack** DMs the assignee when a ticket is assigned, or posts to a fallback channel.
- **Resend** sends outbound replies to the customer when an agent replies on a ticket.

## Architecture at a glance

```
Customer email ─▶ Postmark inbound parse ─▶ POST /webhooks/postmark/inbound
                                                  │
                                                  ▼
                                      Zuplo Gateway (this kit)
                                                  │
              ┌───────────────────────────────────┼───────────────────────────────────┐
              ▼                                   ▼                                   ▼
        Tickets API                   triage_incoming_ticket                   Slack notify
   (CRUD + assign + reply)            (Claude classify + draft)            (DM agent on assign)
              │                                   │                                   │
              └─────────────► Database adapter ◄──┘                                   ▼
                          (in-memory / Supabase /                                Resend send
                           Firestore / Upstash / Neon)                       (outbound replies)
```

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
| `in-memory` | Default — boots without any credentials |
| `supabase` | Supported |
| `firestore` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll want credentials for:

- **Postmark** (`POSTMARK_WEBHOOK_USERNAME`, `POSTMARK_WEBHOOK_PASSWORD`) for the inbound email webhook
- **Claude** (`ANTHROPIC_API_KEY`) for triage + drafting
- **Slack** (`SLACK_BOT_TOKEN` or `SLACK_WEBHOOK_URL`) for assignment notifications
- **Resend** (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) for outbound replies

The kit boots with `DB_PROVIDER=in-memory` and no credentials — handlers that hit external services will throw a clear error until those env vars are set.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets` | List tickets |
| POST | `/tickets` | Create a ticket |
| GET | `/tickets/{id}` | Get a ticket |
| PATCH | `/tickets/{id}` | Update fields |
| PATCH | `/tickets/{id}/assign` | Assign agent + Slack-notify them |
| POST | `/tickets/{id}/reply` | Add a reply (sends email via Resend on public replies) |
| PATCH | `/tickets/{id}/close` | Close ticket |
| PATCH | `/tickets/{id}/reopen` | Reopen closed ticket |
| GET | `/macros` | List macros (canned replies) |
| POST | `/macros` | Create a macro |
| POST | `/apply-macro` | Apply a macro as a ticket reply |
| POST | `/triage-incoming-ticket` | Orchestrator: Claude triage + draft reply |
| POST | `/escalate-with-summary` | Orchestrator: chronological handoff summary |
| POST | `/summarize-recurring-issues` | Orchestrator: top recurring tags |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Provider | Notes |
|---|---|---|
| `POST /webhooks/postmark/inbound` | Postmark inbound stream | HTTP Basic Auth (configure user/pass in Postmark UI to match `POSTMARK_WEBHOOK_*` env vars). Creates a ticket from the parsed email. |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_tickets` | yes | DB | List tickets in tenant |
| `get_ticket` | yes | DB | Get ticket by id |
| `create_ticket` | no | DB | Open a new ticket |
| `update_ticket` | no | DB | Patch ticket fields |
| `assign_ticket` | no | DB + Slack | Assign agent + DM them |
| `reply_to_ticket` | no | DB + Resend | Add reply, email customer on public |
| `close_ticket` | destructive | DB | Close ticket |
| `reopen_ticket` | no | DB | Reopen closed ticket |
| `list_macros` | yes | DB | List canned replies |
| `create_macro` | no | DB | Add a canned reply |
| `apply_macro` | no | DB | Apply a macro to a ticket |
| `triage_incoming_ticket` | yes | Claude + DB | Classify, prioritise, suggest owner, draft reply |
| `escalate_with_summary` | yes | DB | Build chronological handoff summary |
| `summarize_recurring_issues` | yes | DB | Cluster recent tickets by tag |

## The AI angle

`triage_incoming_ticket` is the marquee orchestrator. Given a ticket id it:

1. Pulls the ticket (via `invokeRoute`, inheriting auth + rate-limit + tenant scoping).
2. Sends the subject + body to Claude with a strict system prompt asking for category, tags, priority, reasoning, and an optional draft reply.
3. Cross-references recent tickets in the same tenant to recommend the assignee who has handled similar tagged tickets most often.
4. Returns a single payload an agent (or an MCP client) can act on directly: assign + reply.

The companion path is fully event-driven: Postmark fires the inbound webhook, the kit creates the ticket, your agent runs `triage_incoming_ticket`, then `assign_ticket` (Slack DMs the human) and `reply_to_ticket` (Resend emails the customer). No polling, no cron.

## Extending

- **Swap Resend for Postmark outbound**: `modules/integrations/postmark.ts` already exposes `sendPostmarkEmail`. Change the import in `reply-to-ticket.ts` to use it; the request shape is similar.
- **Replace the Slack notifier with PagerDuty**: drop a `pagerduty.ts` integration alongside `slack.ts` and call it from `assign-ticket.ts` for `urgent` priority tickets only.
- **Switch the LLM**: `modules/integrations/claude.ts` reads `ANTHROPIC_MODEL` and `AI_GATEWAY_URL`; point those at any OpenAI-compatible gateway and minimal changes to the JSON schema hint will let you swap providers.
- **Add a new orchestrator**: create a handler in `modules/mcp-tools/`, register the route + `mcp` annotation in `routes.oas.json`, and add the operationId to the `/mcp` operations array.
- **Switch databases**: change `DB_PROVIDER` in `.env`. Handler code never changes.

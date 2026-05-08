# Headless CRM API

A headless CRM that talks to the systems your reps already live in — email, calendar, an LLM. Models accounts, contacts, deals, activities, and notes; exposes them as a clean REST + MCP API; and ships orchestrator tools that compose real work across services.

Replaces: Salesforce, HubSpot CRM, Pipedrive.

## Wires up

**Resend** sends the follow-up emails your reps log to /activities. **Google Calendar** folds real meeting history into the account timeline (one OAuth token, no SDK). **Claude** turns that timeline into a 200-word pre-call brief — the kind an AE would normally cobble together by reading five tabs.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Resend       (log_activity sendEmail)
                │                  ├── Google Cal   (account_timeline meetings)
                │                  └── Claude       (account_timeline brief)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/headless-crm
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

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need:

- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — for outbound email
- `GOOGLE_CALENDAR_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ID` — for meeting history
- `ANTHROPIC_API_KEY` (or `AI_GATEWAY_URL`) — for the timeline summary

The kit boots and CRUD endpoints work without any of these — integrations only kick in when their tools are invoked with the right flags.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts` | List accounts |
| POST | `/accounts` | Create account |
| GET | `/accounts/{id}` | Get account |
| GET | `/contacts` | List contacts |
| GET | `/contacts/{id}` | Get contact |
| POST | `/contacts` | Create contact |
| GET | `/deals` | List deals |
| GET | `/deals/{id}` | Get deal |
| POST | `/deals` | Create deal |
| PATCH | `/deals/{id}/stage` | Progress deal stage |
| GET | `/activities` | List activities |
| POST | `/activities` | Log activity (optionally sends email via Resend) |
| POST | `/account-timeline` | Orchestrator: timeline + Claude brief |
| POST | `/find-warm-intro` | Orchestrator: intro paths |
| POST | `/pipeline-summary-by-owner` | Orchestrator: pipeline rollup |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_accounts` / `get_account` / `create_account` | mixed | DB | Accounts |
| `list_contacts` / `get_contact` / `create_contact` | mixed | DB | Contacts |
| `list_deals` / `get_deal` / `create_deal` / `progress_deal_stage` | mixed | DB | Deals |
| `list_activities` | yes | DB | Read activities |
| `log_activity` | no | DB + **Resend** | Log activity, optionally send email |
| `account_timeline` | yes | DB + **Google Calendar** + **Claude** | Merged history + pre-call brief |
| `find_warm_intro` | yes | DB | Intro paths via shared owners |
| `pipeline_summary_by_owner` | yes | DB | Pipeline rollup |

## The AI angle

`account_timeline` is the orchestrator that earns the kit. Pass an `accountId` and it walks the database for activities, notes, and deal events; optionally pulls Google Calendar meetings for any contact emails you provide; and — when `summarize: true` — feeds the merged stream to Claude with a "be a sales ops assistant; produce a pre-call brief" prompt. The same MCP tool is callable from Claude Desktop ("brief me on Acme before the 3pm"), an internal cron, your own UI, or another agent.

`log_activity` rounds it out: when an AE logs an outbound email through MCP, set `sendEmail: true` and the kit hands it to Resend, captures the message id, and writes the activity record — one tool call instead of "draft → switch tabs → send → switch back → log".

## Extending

- **Swap email providers:** replace `modules/integrations/resend.ts` with `postmark.ts` (same shape, different REST endpoint). The handler imports change in one place.
- **Add Outlook calendar:** drop `modules/integrations/microsoft-graph.ts` next to `google-calendar.ts` and have `account_timeline` merge from both.
- **Route Claude through a gateway:** set `AI_GATEWAY_URL`. The integration prefers the gateway when set, so your prompt-injection / budget / rate-limit policies live in one place.
- **Custom fields:** add a `customFields: Record<string, unknown>` column to any entity.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

# Lead Routing / SDR Starter Kit

Headless lead routing that actually pages the rep. Inbound lead → rule match → assignment → Slack ping → email follow-up — one MCP tool call.

Replaces: Chili Piper, LeanData, Salesforce Flow routing.

## Wires up

**Slack** delivers the "you got a new lead" ping into a channel or DM, using a bot token (preferred) or an incoming webhook URL. **Resend** sends the optional rep email — same data, different channel — handy for reps who live in Gmail.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Slack    (chat.postMessage / webhook)
                │                  └── Resend   (rep notification email)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/lead-routing
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

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `SLACK_BOT_TOKEN` + `SLACK_DEFAULT_CHANNEL` — preferred Slack mode
- `SLACK_WEBHOOK_URL` — fallback webhook mode (set either, not both)
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — only if you want email pings

The kit boots and routes leads without any of these — notifications are skipped if their env isn't configured.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leads` | List leads |
| POST | `/leads` | Create lead |
| GET | `/leads/{id}` | Get lead |
| PATCH | `/leads/{id}/assign` | Assign lead |
| PATCH | `/leads/{id}/qualify` | Mark qualified |
| PATCH | `/leads/{id}/disqualify` | Mark unqualified |
| GET | `/routing-rules` | List routing rules |
| POST | `/routing-rules` | Create routing rule |
| GET | `/territories` | List territories |
| POST | `/meeting-bookings` | Book meeting |
| POST | `/route-lead-intelligently` | Orchestrator: route + notify |
| POST | `/match-lead-to-account` | Orchestrator |
| POST | `/summarize-unworked-leads` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_leads` / `get_lead` | yes | DB | Lead reads |
| `create_lead` | no | DB | Create lead |
| `assign_lead` / `qualify_lead` / `disqualify_lead` | no | DB | Lead writes |
| `list_routing_rules` / `create_routing_rule` | mixed | DB | Rule management |
| `list_territories` | yes | DB | Territory read |
| `book_meeting` | no | DB | Meeting booking |
| `route_lead_intelligently` | no | DB + **Slack** + **Resend** | Auto-route + notify |
| `match_lead_to_account` | yes | DB | Sibling leads at same domain |
| `summarize_unworked_leads` | yes | DB | Stale pipeline scan |

## The AI angle

`route_lead_intelligently` is the high-leverage orchestrator. Pass it a `leadId` and it walks active routing rules in priority order, picks the first matching rule, calls `/leads/{id}/assign`, and (if `notifySlack !== false` and Slack is configured) posts a formatted message to the rep's channel — "New lead assigned to alice@: Acme, score 87, source webform". Same call optionally fires a Resend email when `notifyEmail: true`. The decision trace comes back with the response so an LLM can answer "why did this go to alice?" without re-running the rules.

The orchestrator is also the natural target for an inbound webform integration: form posts to `/leads`, then your form processor calls `route_lead_intelligently`, and the rep is paged within seconds — no Zapier in the middle.

## Extending

- **Swap Slack for Teams / Discord:** replace `modules/integrations/slack.ts` with a Microsoft Graph / Discord webhook adapter. Same shape: `postMessage(channel, text, blocks)`.
- **Round-robin instead of rule-based:** replace the rule iteration in `route-lead-intelligently.ts` with a counter-on-Upstash and pick the next rep in the territory.
- **Fold in enrichment:** call Clearbit / Apollo before rule evaluation, augment the lead, then evaluate rules — the orchestrator keeps the same output shape.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

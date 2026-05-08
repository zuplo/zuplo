# NPS / Customer Feedback API Starter Kit

NPS, CSAT, and CES that actually closes the loop: send by email or SMS, capture bounces, escalate detractors to Slack, and let Claude cluster the verbatims so you stop reading comments at midnight.

Replaces: Delighted, Wootric, AskNicely.

## Wires up

**Resend** sends email surveys and posts bounce / complaint events back through the inbound webhook. **Twilio** sends SMS surveys and reports delivery status to its inbound webhook. **Slack** receives the detractor escalation — top N unaddressed detractors get pinged into a CSM channel. **Claude** reads recent verbatims and clusters them into themes with summaries — a real CX research pass instead of grep-by-keyword.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Resend   (send_survey email + bounce webhook)
                │                  ├── Twilio   (send_survey SMS + status webhook)
                │                  ├── Slack    (flag_detractor_for_csm escalation)
                │                  └── Claude   (cluster_open_responses)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/nps-feedback
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

See [env.example](./env.example). Each integration is opt-in:

- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SIGNING_SECRET` — email survey delivery + bounce
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — SMS survey delivery + status webhook
- `SLACK_BOT_TOKEN` (+ `SLACK_DEFAULT_CHANNEL`) or `SLACK_WEBHOOK_URL` — detractor escalation
- `ANTHROPIC_API_KEY` (or `AI_GATEWAY_URL`) — Claude theme clustering

The kit boots without any of these. send_survey rejects rows for channels whose env isn't set; cluster_open_responses falls back to keyword clustering when Claude is unavailable.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/surveys` | List surveys |
| POST | `/surveys` | Create survey |
| GET | `/surveys/{id}` | Get survey |
| POST | `/surveys/{id}/send` | Send survey (Resend email / Twilio SMS) |
| GET | `/responses` | List responses |
| POST | `/responses` | Record a response |
| GET | `/responses/{id}` | Get a response |
| GET | `/follow-ups` | List follow-ups |
| POST | `/follow-ups` | Log a follow-up |
| POST | `/cluster-open-responses` | Orchestrator: Claude theme clustering |
| POST | `/flag-detractor-for-csm` | Orchestrator: detractor list (+ Slack) |
| POST | `/compare-cohorts` | Orchestrator: NPS by segment |
| POST | `/webhooks/resend` | Inbound Resend (Svix) events |
| POST | `/webhooks/twilio` | Inbound Twilio status callbacks |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Verifies | Handles |
|---|---|---|
| `/webhooks/resend` | `svix-id` / `svix-timestamp` / `svix-signature` against `RESEND_WEBHOOK_SIGNING_SECRET` | `email.bounced`, `email.complained`, `email.delivered`, `email.opened`, `email.clicked` |
| `/webhooks/twilio` | `X-Twilio-Signature` (HMAC-SHA1) against `TWILIO_AUTH_TOKEN` | Message delivery state — logs `failed` / `undelivered` for retry |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_surveys` / `get_survey` | yes | DB | Survey reads |
| `create_survey` | no | DB | Create survey |
| `send_survey` | no | DB + **Resend** + **Twilio** | Multi-channel dispatch |
| `list_responses` / `get_response` / `record_response` | mixed | DB | Response data |
| `list_followups` / `log_followup` | mixed | DB | Follow-up tracking |
| `cluster_open_responses` | yes | DB + **Claude** | Theme clustering |
| `flag_detractor_for_csm` | yes | DB + **Slack** | Detractor list + escalation |
| `compare_cohorts` | yes | DB | NPS by segment |

## The AI angle

`cluster_open_responses` is the kit's reason to exist. CX teams have a verbatim review meeting every week where someone reads 200 NPS comments out loud and someone else types "pricing" in a Google Doc. This orchestrator does it in a single tool call: pull recent verbatims for a survey (optionally filtered to detractors), hand them to Claude with a "you are a CX research analyst, group these into at most 6 themes with 1-2 sentence summaries" system prompt, and return the structured themes — name, count, summary, contributing verbatim ids — sorted by frequency. Falls back to keyword clustering when Claude is off.

`flag_detractor_for_csm` rounds out the closed-loop: when ops calls it with `postToSlack: true`, the detractor list lands in the CSM channel automatically. Pair the two on a weekly cron and you have a fully automated VOC program.

## Extending

- **Swap email provider:** replace `modules/integrations/resend.ts` with a Postmark / SES / SendGrid adapter and update the webhook signature scheme.
- **Add WhatsApp via Twilio:** the same `sendTwilioSms` works against a WhatsApp sender — change `From` to `whatsapp:+14155...`.
- **Send Slack threads instead of single posts:** the `postSlackMessage` helper accepts `threadTs` already; have the orchestrator open a thread per detractor.
- **Route Claude through a gateway:** set `AI_GATEWAY_URL`. Useful for adding budget caps in front of weekly clustering runs.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

# Survey & Poll API

A real survey product, not a CRUD shell: build a survey, blast it via Resend (email) or Twilio (SMS), Slack-alert on detractors, and let Claude bucket open-text responses into themes.

Replaces: SurveyMonkey, Typeform, Polly, Slido (the data layer + the distribution + the analysis).

## Wires up

Resend distributes the survey by email; Twilio by SMS — both are first-class `send_survey` channels. When a respondent submits, the kit scans for any NPS-kind answer ≤ 6 and posts a *Detractor* alert to Slack so a human can intervene before the customer churns. The headline orchestrator `cluster_open_responses` calls Claude to label and group free-text answers into named themes (with a token-frequency fallback if `ANTHROPIC_API_KEY` isn't set). The inbound `/webhooks/resend` route catches bounces and complaints (Svix-signed) so you can suspend bad addresses.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ submit_response  ──▶ Slack (detractor alert)
                                                  └▶ DB adapter (responses + answers)
                              send_survey       ──▶ Resend (email) | Twilio (SMS)
                              cluster_open_responses ──▶ Claude (themes) [fallback: tokens]
                              /webhooks/resend  ──▶ verifySvixSignature(rawBody, secret)
                                                  └▶ domain handler (bounce/complaint)
                ▼
         /mcp ──▶ MCP server ──▶ orchestrator tools
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/survey-poll
cd survey-poll
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

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- **Resend** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (default sender), `RESEND_WEBHOOK_SECRET` (for inbound bounces).
- **Twilio** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.
- **Slack** — `SLACK_WEBHOOK_URL` or `SLACK_BOT_TOKEN` + `SLACK_DEFAULT_CHANNEL`.
- **Claude** — `ANTHROPIC_API_KEY` (and optional `AI_GATEWAY_URL` to route through Zuplo's AI Gateway, optional `CLAUDE_MODEL`).

If Claude is unset, `cluster_open_responses` falls back to keyword-frequency tokenization. If Slack is unset, detractor detection still runs but the alert is a logged warning.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/surveys` | List surveys |
| POST | `/surveys` | Create a survey |
| GET | `/surveys/{id}` | Get a survey |
| GET | `/surveys/{id}/questions` | List questions |
| POST | `/surveys/{id}/questions` | Add a question |
| PATCH | `/surveys/{id}/open` | Open survey for responses |
| PATCH | `/surveys/{id}/close` | Close a survey |
| GET | `/surveys/{id}/responses` | List responses |
| POST | `/surveys/{id}/results` | Summarize results |
| POST | `/responses` | Submit a response (NPS detractor → Slack) |
| GET | `/responses/{id}` | Get a response (with answers) |
| POST | `/send-survey` | Orchestrator: blast a survey via Resend or Twilio |
| POST | `/cluster-open-responses` | Orchestrator: cluster text answers via Claude |
| POST | `/compare-cohorts` | Orchestrator: cohort distribution diff |
| POST | `/propose-followup-question` | Orchestrator: suggest a follow-up |
| POST | `/webhooks/resend` | Inbound: Resend delivery + bounce events (Svix-signed) |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Verifies | Purpose |
|---|---|---|
| `/webhooks/resend` | Svix HMAC signature using `RESEND_WEBHOOK_SECRET` (header `svix-signature`) | Bounce / complaint events. Currently logs; extend the handler to mark the email as undeliverable in your contact list. |

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| CRUD: `list_surveys`, `get_survey`, `create_survey`, `list_questions`, `add_question`, `open_survey`, `close_survey`, `list_responses`, `submit_response`, `get_response`, `summarize_results` | DB | Standard reads/writes. `submit_response` also calls Slack when a detractor is detected. |
| `send_survey` | DB + Resend OR Twilio | Distribute the survey to a recipient list. Email → Resend; SMS → Twilio. Returns a per-recipient delivery report. |
| `cluster_open_responses` | DB + Claude (with token fallback) | Group open-text answers into named themes with sample comments. |
| `compare_cohorts` | DB | Distribution diff across cohorts. |
| `propose_followup_question` | DB | Suggested follow-up prompt based on theme keywords. |

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

`cluster_open_responses` is the headline. Open-text questions are the goldmine of every survey and the bane of analysts; this tool calls Claude with a strict-JSON system prompt and gets back named themes with sample comments mapped back to original responses. Pair with `propose_followup_question` to draft a sharper follow-up, and `compare_cohorts` to see which segments care about each theme. Then `send_survey` blasts the follow-up over Resend or Twilio in one call.

`submit_response` is the unglamorous loop closer: every NPS detractor (score 0–6) trips a Slack alert with the response id, so a human gets a chance to save the relationship before the survey closes.

## Extending

- **Swap Resend for Postmark/SendGrid**: replace `modules/integrations/resend.ts` with a function that hits the alternate provider. The orchestrator's `sendResendEmail(...)` call is a single line.
- **Swap Twilio for MessageBird/Vonage**: same shape — replace `modules/integrations/twilio.ts`.
- **Swap Claude for OpenAI**: rewrite `modules/integrations/claude.ts` to call `https://api.openai.com/v1/chat/completions`. Keep the same `callClaude(...)` signature so `cluster_open_responses` still works.
- **Smarter clustering**: swap the JSON-output prompt in `cluster_open_responses` for embedding-based clustering (e.g. POST text to an embeddings endpoint, then k-means).
- **Branching logic**: add a `next` field on `Question` and have `submit_response` skip questions that don't apply.
- **Quiz scoring**: add `correctAnswer` on `Question` and a server-side scoring step in `submit_response`.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.

# Lead Capture & Forms API

A first-party form backend that captures submissions, scores them with Claude, fans them out to Slack, and confirms them via Resend — all behind a Zuplo gateway with an MCP server agents can drive.

Replaces: Typeform, Formspree, HubSpot Forms, Tally, plus the glue code you'd otherwise wire to Slack and a transactional ESP.

## Wires up

**Slack** is the human-loop notification channel — every fresh submission posts a tidy block-kit card to your sales/ops channel. **Resend** sends an instant confirmation email back to the submitter so the form doesn't feel like a black hole, and its bounce/complaint webhook keeps your suppression list honest. **Claude** grades each submission for fit, intent, and spam — heuristics catch the obvious junk; Claude catches the polished agency pitch a regex never would.

## Architecture at a glance

```
Browser / API   ──▶ Zuplo Gateway ──▶ POST /submissions
                          │                  │
                          │                  ├── repository (Supabase / Firestore / Neon / Upstash)
                          │                  ├── Slack (new-lead alert)
                          │                  └── Resend (confirmation email)
                          │
                          └─▶ POST /score-lead (orchestrator)
                                   ├── heuristic signals (email, title, recency)
                                   ├── Claude (intent + spam grade)
                                   ├── Slack (high-score alert)
                                   └── Resend (optional confirmation)

Resend ──▶ POST /webhooks/resend  (bounce + complaint suppression)
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/lead-capture-forms
cd lead-capture-forms
cp env.example .env
npm install
npm run dev
```

The gateway boots at `http://localhost:9000`. To explore the MCP server:

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

## Choosing a database

This kit ships with HTTP-only adapters (the kits run in Zuplo's edge runtime — no TCP drivers). Set `DB_PROVIDER` in `.env` to one of:

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default — the kit boots without any credentials so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need credentials for the integrations above:

- `SLACK_WEBHOOK_URL` (or `SLACK_BOT_TOKEN` + `SLACK_CHANNEL`)
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (and `RESEND_WEBHOOK_SECRET` for the inbound webhook)
- `ANTHROPIC_API_KEY` (and optionally `AI_GATEWAY_URL` to route through Zuplo's AI Gateway)

Any of these may be omitted — the kit fails open: missing Slack creds skip the notification, missing Resend creds skip the confirmation, missing Anthropic creds skip Claude grading.

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| POST | `/flag-spam-pattern` | `flag_spam_pattern` | Propose a new spam rule from suspicious patterns (orchestrator) | tool |
| GET | `/forms` | `list_forms` | List forms | tool |
| POST | `/forms` | `create_form` | Create a form | tool |
| GET | `/forms/{id}` | `get_form` | Get a form by id | tool |
| POST | `/route-submission-to-owner` | `route_submission_to_owner` | Route a submission to an owner (orchestrator) | tool |
| POST | `/score-lead` | `score_lead` | Score a lead, optionally with Claude + Slack + Resend (orchestrator) | tool |
| GET | `/spam-rules` | `list_spam_rules` | List spam rules | tool |
| POST | `/spam-rules` | `create_spam_rule` | Create a spam rule | tool |
| GET | `/submissions` | `list_submissions` | List submissions | tool |
| POST | `/submissions` | `create_submission` | Submit a form (auto-fans out to Slack + Resend) | tool |
| GET | `/submissions/{id}` | `get_submission` | Get a submission by id | tool |
| PATCH | `/submissions/{id}/route` | `set_submission_owner` | Assign a submission to an owner | tool |
| GET | `/webhooks` | `list_webhooks` | List webhook subscriptions | tool |
| POST | `/webhooks` | `create_webhook` | Create a webhook subscription | tool |
| POST | `/webhooks/resend` | `resend_webhook` | Inbound Resend bounce/complaint webhook | — |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Provider | Path | Signature env |
|---|---|---|
| Resend | `POST /webhooks/resend` | `RESEND_WEBHOOK_SECRET` (Svix-format `whsec_…`) |

The handler verifies the Svix signature against the raw request body, parses the event, and logs bounces and complaints. Wire the suppression hook in `modules/handlers/resend-webhook.ts` to your CRM or DB.

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `list_forms` | repo | List forms |
| `create_form` | repo | Create a form |
| `get_form` | repo | Get a form by id |
| `list_submissions` | repo | List submissions |
| `create_submission` | repo, Slack, Resend | Submit a form (auto-notify + confirm) |
| `get_submission` | repo | Get a submission by id |
| `set_submission_owner` | repo | Assign a submission to an owner |
| `list_webhooks` | repo | List webhook subscriptions |
| `create_webhook` | repo | Create a webhook subscription |
| `list_spam_rules` | repo | List spam rules |
| `create_spam_rule` | repo | Create a spam rule |
| `score_lead` | repo, Claude, Slack, Resend | Score a lead and optionally fan out |
| `route_submission_to_owner` | repo | Round-robin route a submission |
| `flag_spam_pattern` | repo | Propose a new spam rule from suspicious patterns |

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

`score_lead` is the kit's headline orchestrator. Heuristics handle the obvious — business email gets +30, missing email gets -15, senior title (`VP/Director/Chief…`) gets +15, recency adds a small kicker — and clamp the score 0-100. Then, if `useClaude: true` is set, the tool calls the Anthropic Messages API with the form payload and returns a structured `{ score, intent, isSpam, reasoning }` JSON. Heuristic + Claude scores blend 50/50; an `isSpam: true` from Claude is a hard veto that drops the score to 5. Set `notifySlack: true` and the result lands in your sales channel as a block-kit card with the score, owner, payload preview, and submission id. Set `confirmEmail: true` and a Resend transactional email goes back to the submitter so the form doesn't feel like a black hole. The same MCP tool can run from Claude Desktop, an inbound CRM trigger, or your own UI — the gateway enforces auth and rate limits regardless of caller.

`flag_spam_pattern` and `route_submission_to_owner` round out the orchestrator set. Together they let an agent triage a queue of submissions end-to-end without touching the underlying CRUD.

## Extending

- **Swap Slack for Microsoft Teams or Discord:** replace `modules/integrations/slack.ts` — both use simple incoming-webhook URLs.
- **Swap Resend for Postmark or AWS SES:** replace `modules/integrations/resend.ts`. Keep the function signatures the same and the handlers don't change.
- **Route Claude through your own gateway:** set `AI_GATEWAY_URL` to a Zuplo proxy with logging + cost limits. The integration prefers it when set.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.
- **Add a new entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`), add a handler, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` operations array.

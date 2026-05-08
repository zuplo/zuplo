# Expense Tracking API

Headless expense management with real OCR, real Slack notifications, and real rejection emails. The agent submits an expense from a receipt photo, the gateway extracts the line items with Mindee, the policy engine flags violations, and Slack pings finance.

Replaces: Expensify, Ramp expenses, Brex expenses (light).

## Wires up

**Mindee** is the receipt OCR — `parse_receipt` returns merchant, amount, date, currency in one call. **Slack** is where approvers live — `flag_policy_violations` drops a digest into the finance channel. **Resend** sends the rejection email back to the submitter so they actually know what happened.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Mindee (receipt OCR)
                │                  ├── Slack (approver digest)
                │                  └── Resend (rejection email)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/expense-tracking
cd starter-kits/expense-tracking
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

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `MINDEE_API_KEY` — receipt OCR
- `SLACK_BOT_TOKEN`, `SLACK_FINANCE_CHANNEL` — approver digest
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — rejection notifications

The kit boots with `DB_PROVIDER=in-memory` and zero other env vars. Each integration is opt-in: skip the env var, skip the call.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/expenses` | List expenses |
| POST | `/expenses` | Create a draft expense |
| GET | `/expenses/{id}` | Get an expense |
| PATCH | `/expenses/{id}/submit` | Submit for approval |
| PATCH | `/expenses/{id}/approve` | Approve |
| PATCH | `/expenses/{id}/reject` | Reject (emails submitter via Resend) |
| GET | `/expense-categories` | List categories |
| GET | `/expense-policies` | List policies |
| POST | `/parse-receipt` | Orchestrator: OCR a receipt URL via Mindee |
| POST | `/flag-policy-violations` | Orchestrator: flag violations + Slack digest |
| POST | `/summarize-pending-approvals` | Orchestrator: pending approvals by employee |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_expenses` | yes | — | List expenses |
| `get_expense` | yes | — | Get expense by id |
| `create_expense` | no | — | Create a draft |
| `submit_expense` | no (idempotent) | — | Submit for approval |
| `approve_expense` | no (idempotent) | — | Approve |
| `reject_expense` | no (idempotent) | Resend | Reject + email submitter |
| `list_categories` | yes | — | List categories |
| `list_policies` | yes | — | List policies |
| `parse_receipt` | yes | Mindee | OCR a receipt URL |
| `flag_policy_violations` | yes | Slack | Find violations, optionally digest to Slack |
| `summarize_pending_approvals` | yes | — | Pending grouped by employee |

## The AI angle

The realistic agent flow is: employee snaps a receipt, an MCP client calls `parse_receipt` (Mindee), then `create_expense` with the extracted fields, then `submit_expense`. Finance runs `flag_policy_violations` with `notifySlack=true` once a day — the gateway joins expenses+categories+policies internally, returns a structured violation list, **and posts a digest in Slack** so an approver can act without leaving their channel. When they `reject_expense`, Resend emails the submitter with the reason. The whole loop is three MCP tools and never exposes the agent to OCR JSON or DB rows.

## Extending

- **Swap OCR provider:** replace `modules/integrations/mindee.ts` with Veryfi/AWS Textract — `parse_receipt` only depends on `parseReceiptFromUrl`.
- **Interactive Slack approvals:** add a `/webhooks/slack/interactions` route that verifies the Slack request signature and calls `approve_expense` / `reject_expense`. The current kit ships outbound notifications only.
- **GL export:** add an `export_to_gl` orchestrator that bundles `approved` expenses by `glCode` and emits a CSV.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

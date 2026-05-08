# Accounts Payable / Bill Pay API

Headless AP that reads vendor bills with OCR, pays them via Stripe, and reconciles against the bank with Plaid — all behind an MCP surface so an agent can drive the whole AP cycle.

Replaces: Bill.com, Melio, Tipalti.

## Wires up

**Mindee** OCR's incoming bill PDFs into structured fields (`parse_bill`). **Stripe Connect Transfers** sends ACH/wire payouts to vendors that have a connected account. **Plaid Transactions** pulls cleared bank activity and `reconcile_with_bank` matches each cleared transaction back to a scheduled payment so AP can close out bills without manual reconciliation.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Mindee (parse_bill)
                │                  ├── Stripe (transfer + signed webhook in)
                │                  └── Plaid (transactions/get + sync)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/accounts-payable
cd starter-kits/accounts-payable
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

- `MINDEE_API_KEY` — bill OCR
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — vendor payouts via Stripe Connect
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ACCESS_TOKEN` — bank reconciliation

Everything is opt-in. Without creds the kit runs as local-only CRUD for demos.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/bills` | List bills |
| POST | `/bills` | Create draft bill |
| GET | `/bills/{id}` | Get bill |
| PATCH | `/bills/{id}/route-for-approval` | Send for approval |
| PATCH | `/bills/{id}/approve` | Approve a bill |
| PATCH | `/bills/{id}/reject` | Reject a bill |
| GET | `/bill-payments` | List scheduled / completed payments |
| POST | `/bill-payments` | Schedule (or push via Stripe) a payment |
| GET | `/vendors` | List vendors |
| POST | `/vendors` | Create vendor |
| POST | `/parse-bill` | Orchestrator: Mindee OCR a bill |
| POST | `/reconcile-with-bank` | Orchestrator: Plaid txn ↔ payment match |
| POST | `/detect-duplicate-bills` | Orchestrator: detect duplicates |
| POST | `/summarize-payable-aging` | Orchestrator: AP aging buckets |
| POST | `/match-bill-to-po` | Orchestrator: PO match candidates |
| POST | `/webhooks/stripe` | Inbound Stripe events |
| POST | `/mcp` | MCP server endpoint |

## Webhooks (inbound)

| Path | Source | What it does |
|---|---|---|
| `/webhooks/stripe` | Stripe | Verifies `Stripe-Signature`. On `transfer.paid`/`payout.paid`, marks the local BillPayment paid and the source Bill paid. On `transfer.reversed`/`payout.failed`, drops the Bill back to `approved` for retry. |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_bills` | yes | — | List bills |
| `get_bill` | yes | — | Get bill by id |
| `create_bill` | no | — | Create a draft bill |
| `route_for_approval` | no (idempotent) | — | Move bill to pending_approval |
| `approve_bill` | no | — | Approve, write audit row |
| `reject_bill` | destructive | — | Reject and void |
| `list_bill_payments` | yes | — | List payments |
| `schedule_payment` | no | Stripe (when `executeNow=true`) | Schedule a future payment, optionally execute via Stripe Transfer |
| `list_vendors` | yes | — | List vendors |
| `create_vendor` | no | — | Create a vendor |
| `parse_bill` | yes | Mindee | OCR a bill PDF/image |
| `reconcile_with_bank` | yes | Plaid | Match cleared bank txns to scheduled payments |
| `detect_duplicate_bills` | yes | — | Find suspect duplicate clusters |
| `summarize_payable_aging` | yes | — | AP aging buckets 0-30/31-60/61-90/90+ |
| `match_bill_to_po` | yes | — | Suggest PO matches within ±5% |

## The AI angle

The realistic flow: a bill PDF arrives in inbox -> agent calls `parse_bill` (Mindee) -> `create_bill` -> `match_bill_to_po` (gateway-deterministic 3-way match) -> `route_for_approval` -> `approve_bill` -> `schedule_payment` with `executeNow=true` (Stripe Transfer) -> Stripe webhook flips the bill to `paid`. Once a day, `reconcile_with_bank` (Plaid) confirms each cleared transaction matches a scheduled payment and surfaces unmatched txns for human review. The LLM never has to talk to Plaid, Mindee, or Stripe directly — it composes MCP tools and the gateway runs the integrations.

## Extending

- **Swap OCR vendor:** replace `modules/integrations/mindee.ts` with Veryfi or AWS Textract — `parse_bill` is the only consumer.
- **Real ACH rail (no Stripe):** replace `modules/integrations/stripe.ts` with Modern Treasury / Increase / your bank's API.
- **Multi-tenant Plaid tokens:** put `plaidAccessToken` on a `BankConnection` entity keyed by tenantId instead of a global env var.
- **OAuth-style approvals:** add `/webhooks/slack/interactions` so approvers can `approve_bill` from a Slack button.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

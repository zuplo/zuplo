# Procurement / Purchase Order API

Headless procurement that routes approvals in Slack, sends POs out for vendor counter-signature with DocuSign, and keeps requesters in the loop with Resend — all behind an MCP surface so an agent can run the procure-to-pay loop end-to-end.

Replaces: Coupa, Procurify, Airbase procurement.

## Wires up

**Slack** is the approval surface — `route_request_for_approval` looks up the first approver by email and DMs them so the chain actually starts moving. **DocuSign** counter-signs POs — `convert_to_po` with `sendForSignature=true` creates an envelope and the vendor signs in their browser. **Resend** sends rejection notices to the requester and a heads-up email to the vendor in parallel with the DocuSign request.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Slack  (approver DM + procurement channel)
                │                  ├── DocuSign (envelope create + status)
                │                  └── Resend (requester reject email, vendor heads-up)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/procurement-po
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

- `DOCUSIGN_BASE_URI`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_ACCESS_TOKEN` — vendor counter-signature
- `SLACK_BOT_TOKEN`, `SLACK_PROCUREMENT_CHANNEL` — approver pings
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — requester/vendor emails

All three integrations are independently optional — the kit will run without any of them and still expose the full MCP surface for demos.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/purchase-requests` | List purchase requests |
| POST | `/purchase-requests` | Create purchase request |
| GET | `/purchase-requests/{id}` | Get purchase request |
| PATCH | `/purchase-requests/{id}/submit` | Submit for approval |
| POST | `/purchase-requests/{id}/approve` | Approve |
| POST | `/purchase-requests/{id}/reject` | Reject (emails requester) |
| POST | `/purchase-requests/{id}/convert-to-po` | Issue PO (DocuSign + Resend) |
| GET | `/purchase-orders` | List POs |
| POST | `/receipts` | Record a receipt |
| GET | `/vendors` | List vendors |
| POST | `/route-request-for-approval` | Orchestrator: chain + Slack DM |
| POST | `/flag-maverick-spend` | Orchestrator: surface policy bypass |
| POST | `/match-invoice-to-po` | Orchestrator: 3-way match candidates |
| POST | `/mcp` | MCP server endpoint |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_purchase_requests` | yes | — | List purchase requests |
| `get_purchase_request` | yes | — | Get one |
| `create_purchase_request` | no | — | Raise a new request |
| `submit_purchase_request` | no | — | Move draft → submitted |
| `approve_purchase_request` | no | — | Approve |
| `reject_purchase_request` | destructive | Resend | Reject + email requester |
| `convert_to_po` | no | DocuSign, Resend | Issue PO, optionally send for signature + notify vendor |
| `list_purchase_orders` | yes | — | List POs |
| `record_receipt` | no | — | Receive against a PO |
| `list_vendors` | yes | — | List vendors |
| `route_request_for_approval` | no | Slack | Build chain + DM first approver |
| `flag_maverick_spend` | yes | — | Flag policy bypass |
| `match_invoice_to_po` | yes | — | 3-way match |

## The AI angle

The procure-to-pay loop with the right surfaces: agent gets a request from `flag_maverick_spend` (rush + thin justification + big spend), reads it back to a human in the procurement channel (Slack), routes via `route_request_for_approval` which pings the first approver in DM, and once approved calls `convert_to_po` with `sendForSignature=true` to fire off the DocuSign envelope and email the vendor in parallel. When AP later tries to pay an incoming invoice, `match_invoice_to_po` returns the 3-way match candidates. The agent never speaks Slack, DocuSign, or SMTP — it composes MCP tools and the gateway speaks the protocols.

## Extending

- **Real PO PDF:** generate a PDF with a renderer of your choice and pass `poPdfBase64` to `convert_to_po` instead of letting it render the placeholder.
- **DocuSign Connect webhook:** add `/webhooks/docusign` that verifies the HMAC signature and calls `update_po` on `envelope-completed`/`-declined`.
- **Slack interactive approvals:** add `/webhooks/slack/interactions` that calls `approve_purchase_request` from a button click.
- **Budget guardrails:** wire a budget repository and reject requests that bust the cost-center budget.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

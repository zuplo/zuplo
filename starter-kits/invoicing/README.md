# Invoicing API

Headless invoicing API that issues real Stripe invoices, sends real chase emails via Resend, and exposes the whole thing as MCP tools so an agent can run the AR collections playbook on its own.

Replaces: QuickBooks Invoicing, FreshBooks, Wave, Bill.com (light).

## Wires up

**Stripe** owns the money rails — we create hosted invoices, finalize them, and let Stripe collect. **Resend** sends the dunning emails (the LLM rewrites tone, we send). **Stripe webhooks** flip our local invoice status to `paid` the moment Stripe charges the card, so the database stays in lockstep without polling.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Stripe (create/send invoice + signed webhook in)
                │                  └── Resend (chase email send)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/invoicing
cd starter-kits/invoicing
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

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — issue invoices and verify inbound events
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — send chase emails

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/invoices` | List invoices |
| POST | `/invoices` | Create a draft invoice |
| GET | `/invoices/{id}` | Get an invoice |
| PATCH | `/invoices/{id}/send` | Mark invoice sent |
| PATCH | `/invoices/{id}/void` | Void an invoice |
| POST | `/payments` | Record a payment |
| GET | `/customers` | List customers |
| POST | `/customers` | Create a customer |
| POST | `/chase-overdue-invoices` | Orchestrator: chase overdue with Stripe + Resend |
| POST | `/summarize-ar-aging` | Orchestrator: AR aging buckets |
| POST | `/webhooks/stripe` | Inbound Stripe events (signature verified) |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Source | What it does |
|---|---|---|
| `/webhooks/stripe` | Stripe | Verifies `Stripe-Signature` header. On `invoice.payment_succeeded`, marks the local invoice paid and writes a `Payment` row. On `invoice.payment_failed`, flips status to `overdue`. |

Point Stripe at `https://<your-zuplo-host>/webhooks/stripe` and copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_invoices` | yes | — | List invoices |
| `get_invoice` | yes | — | Get invoice by id |
| `create_invoice` | no | — | Create a draft invoice |
| `send_invoice` | no (idempotent) | — | Move draft → sent |
| `void_invoice` | destructive | — | Void an invoice |
| `record_payment` | no | — | Record a payment, mark invoice paid |
| `list_customers` | yes | — | List customers |
| `create_customer` | no | — | Create a customer |
| `chase_overdue_invoices` | yes (when `dryRun=true`) | Stripe, Resend | Per-invoice chase, optionally creates Stripe hosted invoice + sends Resend email |
| `summarize_ar_aging` | yes | — | Buckets 0-30/31-60/61-90/90+ |

## The AI angle

`chase_overdue_invoices` is the headline. Default `dryRun=true` lets an LLM safely preview: it walks AR aging, drafts a per-customer email, and returns the list with neutral copy the agent can rewrite for voice. Flip `dryRun=false` and the same call **creates a Stripe hosted invoice for each overdue customer and sends the chase email via Resend** — every step inherits API key auth + rate-limit because the orchestrator stays inside the gateway via `context.invokeRoute()`. When the customer pays, Stripe fires `invoice.payment_succeeded`, the gateway verifies the signature, and the invoice flips to `paid` — all without your app polling.

The same MCP tool runs from Claude Desktop, an internal cron, or your own UI.

## Extending

- **Swap email provider:** replace `modules/integrations/resend.ts` with Postmark/SendGrid — the orchestrator only depends on `sendResendEmail`.
- **Swap payments:** replace `modules/integrations/stripe.ts` with Adyen, Square, or PayPal. Update the webhook verifier accordingly.
- **Add line items:** extend `Invoice` with a `lineItems` array, build them in `create_invoice`, and pass each as a Stripe `invoiceitem`.
- **Auto-chase cron:** Zuplo runs no cron — wire your own scheduler (Vercel Cron, GitHub Actions, AWS EventBridge) to POST `/chase-overdue-invoices` on a schedule.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

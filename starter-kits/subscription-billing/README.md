# Subscription Billing API

A thin wrapper over Stripe Billing that exposes plan, subscription, and usage management as MCP tools — so an agent can subscribe a customer, report metered usage, and pause/cancel without learning the Stripe API.

Replaces: light Chargebee/Recurly setups, your in-house "billing-service" microservice.

## Wires up

**Stripe Billing** owns subscription state, invoices, and renewals. We don't duplicate that — the local store keeps just enough for joins (customer/plan IDs, snapshot status) and reconciles on every webhook. `create_plan` provisions a Stripe Product+Price; `create_subscription` provisions a Stripe Subscription; `record_usage` posts a usage record so Stripe computes overages at period end.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  └── Stripe Billing
                │                       ├─ /products /prices    (create_plan)
                │                       ├─ /customers           (create_subscription)
                │                       ├─ /subscriptions       (create / cancel / pause)
                │                       ├─ /subscription_items/.../usage_records (record_usage)
                │                       └─ webhook in: customer.subscription.* + invoice.*
                ▼
          Database adapter (mirror only — IDs + snapshot state)
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/subscription-billing
cd starter-kits/subscription-billing
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

Local-only mode boots without Stripe credentials so you can demo the MCP surface zero-config. To exercise real billing, set `STRIPE_SECRET_KEY` and point a webhook listener at `/webhooks/stripe`:

```bash
stripe listen --forward-to localhost:9000/webhooks/stripe
# Copy the printed whsec_... into STRIPE_WEBHOOK_SECRET
```

## Choosing a database

| Adapter | Status |
|---|---|
| `in-memory` | Default — boots without any credentials |
| `supabase` | Supported |
| `firestore` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

The DB only stores the mapping (`stripeSubscriptionId`, `stripeCustomerId`, `stripeItemId`) plus a snapshot of status reconciled from Stripe. The store is a cache, not the source of truth.

## Environment variables

See [env.example](./env.example).

- `STRIPE_SECRET_KEY` — turns Stripe mode on. Without it, the kit runs in local-only mode (no real billing — for demos).
- `STRIPE_WEBHOOK_SECRET` — required to verify inbound events.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/subscriptions` | List subscriptions |
| POST | `/subscriptions` | Create subscription (creates a Stripe sub) |
| GET | `/subscriptions/{id}` | Get subscription |
| PATCH | `/subscriptions/{id}/cancel?immediate=...` | Cancel via Stripe (default: at period end) |
| PATCH | `/subscriptions/{id}/pause` | Pause Stripe collection |
| GET | `/plans` | List plans |
| POST | `/plans` | Create plan (creates Stripe Product+Price) |
| POST | `/usage-records` | Record usage (forwards to Stripe) |
| GET | `/billing-invoices` | List invoices written by webhook |
| POST | `/forecast-mrr` | Orchestrator: MRR forecast |
| POST | `/find-at-risk-subscriptions` | Orchestrator: at-risk subs |
| POST | `/propose-upgrade-for-customer` | Orchestrator: upgrade pitch |
| POST | `/webhooks/stripe` | Inbound Stripe events (signature verified) |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Source | What it does |
|---|---|---|
| `/webhooks/stripe` | Stripe | Verifies `Stripe-Signature`. Reconciles `customer.subscription.updated`/`deleted` -> local sub status, period, trial end, canceled_at. Writes `BillingInvoice` rows on `invoice.payment_succeeded`/`failed`. |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_subscriptions` | yes | — | List subscriptions (mirror) |
| `get_subscription` | yes | — | Get by id |
| `create_subscription` | no | Stripe | Create Stripe customer (idempotent) + subscription |
| `cancel_subscription` | destructive | Stripe | Cancel-at-period-end (or immediate via `?immediate=true`) |
| `pause_subscription` | no (idempotent) | Stripe | Pause collection in Stripe |
| `list_plans` | yes | — | List plans |
| `create_plan` | no | Stripe | Create Stripe Product+Price |
| `record_usage` | no | Stripe | Forwards to `subscription_items/.../usage_records` |
| `list_billing_invoices` | yes | — | Webhook-written invoice mirror |
| `forecast_mrr` | yes | — | Sum active subs × monthly price |
| `find_at_risk_subscriptions` | yes | — | past_due, cancellation pending, trial ending |
| `propose_upgrade_for_customer` | yes | — | Suggest upgrade based on usage |

## The AI angle

The kit is the MCP-shaped interface to Stripe Billing for an agent. A CS agent runs `find_at_risk_subscriptions` (joins past-due, trial-ending, cancellation-pending in one call), drafts an outreach, and — if the customer says yes — calls `propose_upgrade_for_customer` to see what plan to move them to. The whole thing stays inside the gateway, with Stripe as the billing engine and the local mirror as a fast read replica that the webhook keeps honest.

## Extending

- **Tax**: turn on Stripe Tax in the dashboard — no code change.
- **Coupons**: add a `discounts` field to `create_subscription` and forward the coupon id to Stripe.
- **Customer portal**: add a `create_billing_portal_session` MCP tool that calls `POST /v1/billing_portal/sessions` and returns the URL.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes — Stripe is the source of truth either way.

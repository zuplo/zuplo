# Subscription Billing API

Headless subscription billing backed by an MCP server. Plans, subscriptions, usage records, and billing invoices, plus orchestrator tools that forecast MRR and surface at-risk customers.

Replaces: Stripe Billing, Chargebee, Recurly.

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

See [env.example](./env.example). The kit boots with `DB_PROVIDER=in-memory` and zero other env vars.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/subscriptions` | List subscriptions |
| POST | `/subscriptions` | Create subscription |
| GET | `/subscriptions/{id}` | Get subscription |
| PATCH | `/subscriptions/{id}/cancel` | Cancel subscription |
| PATCH | `/subscriptions/{id}/pause` | Pause subscription |
| GET | `/plans` | List plans |
| POST | `/plans` | Create plan |
| POST | `/usage-records` | Record usage |
| GET | `/billing-invoices` | List billing invoices |
| POST | `/forecast-mrr` | Orchestrator: MRR forecast |
| POST | `/find-at-risk-subscriptions` | Orchestrator: at-risk subs |
| POST | `/propose-upgrade-for-customer` | Orchestrator: suggest upgrade |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_subscriptions` | yes | List subscriptions |
| `get_subscription` | yes | Get subscription by id |
| `create_subscription` | no | Subscribe a customer to a plan |
| `cancel_subscription` | destructive | Cancel a subscription |
| `pause_subscription` | no (idempotent) | Pause a subscription |
| `list_plans` | yes | List plans |
| `create_plan` | no | Create a plan |
| `record_usage` | no | Append a usage record |
| `list_billing_invoices` | yes | List billing invoices |
| `forecast_mrr` | yes | Sum active subs × monthly price |
| `find_at_risk_subscriptions` | yes | past_due, cancellation pending, trial ending |
| `propose_upgrade_for_customer` | yes | Suggest upgrade based on usage |

## The AI angle

`find_at_risk_subscriptions` and `propose_upgrade_for_customer` give a CS agent everything it needs to keep revenue intact. Instead of teaching the LLM to paginate three endpoints and apply seven business rules, the gateway does the joins and returns a structured answer the agent can act on with `record_usage` or `cancel_subscription`.

## Extending

- **Dunning**: add a `retry_failed_payment` orchestrator that lists `BillingInvoice` with status=failed and triggers a retry.
- **Coupons**: add a `Coupon` entity and apply it during `create_subscription`.
- **Stripe sync**: add a webhook handler that calls `record_usage` from a Stripe `usage_record` event.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.

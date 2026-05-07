# Subscription Billing Starter Kit

Headless subscription billing — plans, subscriptions, usage, billing invoices. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/subscriptions` | List subscriptions |
| POST | `/subscriptions` | Create subscription |
| GET | `/subscriptions/{id}` | Get subscription |
| PATCH | `/subscriptions/{id}/cancel` | Cancel (destructive) |
| PATCH | `/subscriptions/{id}/pause` | Pause |
| GET | `/plans` | List plans |
| POST | `/plans` | Create plan |
| POST | `/usage-records` | Record usage |
| GET | `/billing-invoices` | List billing invoices |
| POST | `/forecast-mrr` | Orchestrator: forecast MRR |
| POST | `/find-at-risk-subscriptions` | Orchestrator: at-risk subs |
| POST | `/propose-upgrade-for-customer` | Orchestrator: upgrade proposal |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Subscription` — primary
- `Plan` — pricing catalog
- `Customer` — billing target
- `UsageRecord` — usage points for a subscription period
- `BillingInvoice` — invoices generated for a billing period

## MCP tools registered

`list_subscriptions`, `get_subscription`, `create_subscription`, `cancel_subscription`, `pause_subscription`, `list_plans`, `create_plan`, `record_usage`, `list_billing_invoices`, `forecast_mrr`, `find_at_risk_subscriptions`, `propose_upgrade_for_customer`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

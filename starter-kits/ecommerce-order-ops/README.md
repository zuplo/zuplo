# E-commerce Order Ops API

Headless OMS for online retailers that does the actual back-office work: takes payment status from Stripe, rate-shops + buys labels via ShipEngine, and texts buyers their tracking link via Twilio.

Replaces: ShipStation, Order Desk, custom OMS code.

## Wires up

- **Stripe** — `/webhooks/stripe` flips orders to `paid` on `payment_intent.succeeded` and to `returned` on `charge.refunded`. The storefront stamps `order_id` + `tenant_id` in PaymentIntent metadata so events route correctly.
- **ShipEngine** — `pick_carrier_for_destination` does a live rate shop across configured carriers; `create_shipment` (with `rateId`) buys the chosen label and writes the tracking number + label PDF URL onto the Shipment.
- **Twilio SMS** — `mark_shipment_in_transit` texts the buyer the tracking link; the ShipEngine webhook texts again on delivered or exception.

## Architecture at a glance

```
Storefront / agent ──▶ Zuplo Gateway ──▶ Integration handlers
                          │                  ├── Stripe       (webhooks → paid / returned)
                          │                  ├── ShipEngine   (rate shop + label, tracking webhook)
                          │                  └── Twilio       (tracking + delivery SMS)
                          ▼
                  Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/ecommerce-order-ops
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

For local Stripe webhook testing:

```bash
stripe listen --forward-to localhost:9000/webhooks/stripe
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

- `STRIPE_WEBHOOK_SECRET`
- `SHIPENGINE_API_KEY`, `SHIPENGINE_WEBHOOK_SECRET`, `SHIPENGINE_CARRIER_IDS`, plus `SHIPENGINE_FROM_*` for the warehouse origin
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

Tools degrade gracefully when keys are missing: `pick_carrier_for_destination` falls back to a rules-only recommendation if `SHIPENGINE_API_KEY` is unset; SMS sends are best-effort.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders` | List orders |
| POST | `/orders` | Create an order |
| GET | `/orders/{id}` | Get an order |
| POST | `/orders/{id}/cancel` | Cancel an order |
| GET | `/shipments` | List shipments |
| POST | `/shipments` | Create shipment (buys ShipEngine label if `rateId` is supplied) |
| PATCH | `/shipments/{id}/in-transit` | Mark in transit + send tracking SMS |
| PATCH | `/shipments/{id}/delivered` | Mark delivered |
| GET | `/returns` | List returns |
| POST | `/returns` | Request a return |
| POST | `/returns/{id}/approve` | Approve a return |
| PATCH | `/returns/{id}/received` | Mark return received |
| POST | `/returns/{id}/refund` | Refund a return |
| GET | `/customers` | List customers |
| GET | `/inventory-adjustments` | List inventory adjustments |
| POST | `/inventory-adjustments` | Adjust inventory |
| POST | `/triage-high-risk-orders` | Orchestrator |
| POST | `/pick-carrier-for-destination` | Orchestrator — live ShipEngine rate shop |
| POST | `/auto-approve-returns-under-policy` | Orchestrator |
| POST | `/webhooks/stripe` | Inbound Stripe webhook |
| POST | `/webhooks/shipengine` | Inbound ShipEngine tracking webhook |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Provider | Behavior |
|---|---|---|
| `POST /webhooks/stripe` | Stripe | Verifies `Stripe-Signature` HMAC. `payment_intent.succeeded` → order paid; `charge.refunded` → order returned. |
| `POST /webhooks/shipengine` | ShipEngine | Verifies the `x-shipengine-secret` shared secret. Updates the matching shipment's status; on `delivered`/`exception` fires a Twilio SMS. |

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `pick_carrier_for_destination` | ShipEngine | Live rate-shop, return cheapest (or fastest for VIP gold). |
| `create_shipment` | ShipEngine | Buy the label tied to a returned `rateId`. |
| `mark_shipment_in_transit` | Twilio | Mark in transit + text the buyer. |
| `triage_high_risk_orders` | — | List paid-but-unshipped orders above a fraud threshold. |
| `auto_approve_returns_under_policy` | — | Bulk-approve small returns inside policy. |
| (plus CRUD) | — | `list_orders`, `get_order`, `create_order`, `cancel_order`, `list_shipments`, `mark_delivered`, `list_returns`, `request_return`, `approve_return`, `mark_received`, `refund_return`, `list_customers`, `list_inventory_adjustments`, `adjust_inventory`. |

## The AI angle

`pick_carrier_for_destination` codifies "what carrier do we use for this destination": the agent calls it once per paid order, gets a `rateId` plus the cheapest delivery price + ETA, then immediately calls `create_shipment` with that `rateId` to buy the label. ShipEngine's tracking webhook then keeps the buyer in the loop without anyone touching a tab. The same agent (or a 5am cron-replacement) walks `triage_high_risk_orders` for fraud holds and `auto_approve_returns_under_policy` for the long tail of small RMAs.

## Extending

- **Swap carrier provider.** Replace `modules/integrations/shipengine.ts` with EasyPost or Shippo. Keep the rate / label / tracking shapes and the orchestrator stays put.
- **Swap payment processor.** Replace `modules/integrations/stripe.ts` with Adyen or Square (and update the webhook signature scheme).
- **Real fraud signals.** Pull a third-party score (Sift, Riskified) into `triage_high_risk_orders` instead of the static `fraudScore` field.
- **Add WhatsApp tracking.** Twilio Programmable Messaging supports WhatsApp; switch the channel in `sendTwilioSms` and prefix the `from`/`to` with `whatsapp:`.
- **Switch databases.** Change `DB_PROVIDER` in `.env`. Handler code never changes.

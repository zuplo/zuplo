# Event Ticketing API

Headless ticketing API that does the actual work — Stripe charges, QR-coded ticket emails, and refund flows — plus an MCP server an LLM can drive in front-of-house. Drop it into a storefront or hand the keys to an agent that runs the box office.

Replaces: Eventbrite, Ticket Tailor.

## Wires up

- **Stripe** — `place_order` mints a PaymentIntent for the buyer; the inbound `/webhooks/stripe` route flips the order to `paid` on `payment_intent.succeeded` and back to `refunded` on `charge.refunded`. `refund_order` issues a real refund against the saved PaymentIntent.
- **Resend** — when an order is paid, the kit emails the buyer their QR ticket (HTML + plain-text fallback) using the templated render in `modules/integrations/resend.ts`.

## Architecture at a glance

```
Buyer ──▶ Zuplo Gateway ──▶ Integration handlers
            │                  ├── Stripe   (PaymentIntent, refunds, webhook)
            │                  └── Resend   (QR ticket email)
            ▼
      Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/event-ticketing
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

To exercise the Stripe webhook locally, install the Stripe CLI and run:

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

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

`place_order` skips the Stripe call if `STRIPE_SECRET_KEY` is unset (dev mode); the webhook + refund flows degrade to status-only updates. Resend emails are only sent if `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are both set.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List events |
| POST | `/events` | Create event (draft) |
| GET | `/events/{id}` | Get event |
| PATCH | `/events/{id}/publish` | Move event to on_sale |
| POST | `/events/{id}/cancel` | Cancel event |
| GET | `/ticket-types` | List ticket tiers |
| POST | `/ticket-types` | Create ticket tier |
| GET | `/orders` | List orders |
| POST | `/orders` | Place order — returns `paymentIntent.clientSecret` |
| POST | `/orders/{id}/refund` | Refund (issues real Stripe refund) |
| GET | `/tickets` | List issued tickets |
| POST | `/tickets/{id}/validate` | Validate (read-only) |
| POST | `/tickets/{id}/check-in` | Check in at the gate |
| GET | `/discounts` | List discount codes |
| POST | `/discounts` | Create discount code |
| POST | `/forecast-attendance` | Orchestrator: forecast |
| POST | `/issue-discount-for-segment` | Orchestrator: mint segment discount |
| POST | `/triage-refund-requests` | Orchestrator: refund triage |
| POST | `/webhooks/stripe` | Inbound Stripe webhook |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Provider | Behavior |
|---|---|---|
| `POST /webhooks/stripe` | Stripe | Verifies `Stripe-Signature` HMAC, then on `payment_intent.succeeded` flips the order to `paid`, mints a Ticket with a QR payload, and sends the Resend email. On `charge.refunded` flips the order to `refunded`. |

Configure the endpoint in Stripe Dashboard > Developers > Webhooks and copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `place_order` | Stripe | Persist order, mint PaymentIntent, return client_secret. |
| `refund_order` | Stripe | Issue real Stripe refund, mark order refunded. |
| `forecast_attendance` | — | Project sell-through from current velocity. |
| `issue_discount_for_segment` | — | Create a tagged percent-off code. |
| `triage_refund_requests` | — | List canceled-but-not-refunded orders inside a window. |
| (plus CRUD) | — | `list_events`, `get_event`, `create_event`, `publish_event`, `cancel_event`, `list_ticket_types`, `create_ticket_type`, `list_orders`, `list_tickets`, `validate_ticket`, `check_in_ticket`, `list_discounts`, `create_discount`. |

## The AI angle

The agent's `place_order` is the load-bearing tool: it does what a human would have to do across three tabs (Stripe dashboard, your DB, and Resend) in one call, and the buyer gets their QR ticket email *automatically* once Stripe confirms the charge — no human in the loop. `triage_refund_requests` is the tool that runs every morning to make sure venue cutoffs don't blow up; `forecast_attendance` lets the same agent decide whether to issue a press code via `issue_discount_for_segment` to fill remaining capacity.

## Extending

- **Swap email provider.** Replace `modules/integrations/resend.ts` with Postmark or SendGrid — keep the `sendResendEmail` and `renderTicketEmailHtml` shapes.
- **Swap payment processor.** Replace `modules/integrations/stripe.ts` with Adyen or Square. Update the metadata-passing in `place_order` and the webhook signature verification.
- **Real QR generation.** The current QR uses a public Google Charts-style endpoint. Swap for a server-side QR library (or Cloudflare R2 + signed URLs) that produces a base64 attachment, and pass it via the Resend `attachments` array.
- **Per-line-item tickets.** Today the webhook mints one Ticket per Order. Add a `quantity` to `OrderCreate`, persist line items, and loop ticket creation in the webhook.
- **Switch databases.** Change `DB_PROVIDER` in `.env`. Handler code never changes.

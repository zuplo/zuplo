# Quote / CPQ Starter Kit

Headless API for B2B quote and CPQ workflows that actually closes the loop: build the quote, get it signed, invoice the buyer.

Replaces: Salesforce CPQ, DealHub, PandaDoc CPQ.

## Wires up

**DocuSign** routes signed PDFs back through Connect — when the envelope completes, the matching quote flips to accepted. **Stripe** issues the customer invoice the moment a quote is accepted (one item per line, finalized, hosted URL ready). **Resend** delivers the emails — quote send, invoice notification.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── DocuSign  (send_quote PDF + Connect webhook)
                │                  ├── Stripe    (accept_quote invoice + payment webhook)
                │                  └── Resend    (send_quote email + invoice email)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/quote-cpq
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

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `DOCUSIGN_*` — only needed if you want envelope-based signing
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNING_SECRET` — for invoicing on accept
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — for outbound email

The kit boots and CRUD endpoints work without any of these. Integrations only kick in when their tool is invoked with the right inputs.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/quotes` | List quotes |
| POST | `/quotes` | Create draft quote |
| GET | `/quotes/{id}` | Get quote |
| POST | `/quotes/{id}/line-items` | Add line item |
| DELETE | `/quotes/{id}/line-items/{lineId}` | Remove line item |
| POST | `/quotes/{id}/discounts` | Apply discount |
| POST | `/quotes/{id}/send` | Send quote (DocuSign or Resend) |
| POST | `/quotes/{id}/accept` | Accept + Stripe-invoice |
| GET | `/products` | List product catalog |
| GET | `/pricing-rules` | List pricing rules |
| POST | `/build-quote-from-requirements` | Orchestrator |
| POST | `/route-for-discount-approval` | Orchestrator |
| POST | `/explain-pricing` | Orchestrator |
| POST | `/webhooks/docusign` | Inbound DocuSign Connect events |
| POST | `/webhooks/stripe` | Inbound Stripe events |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Verifies | Handles |
|---|---|---|
| `/webhooks/docusign` | `x-docusign-signature-1` HMAC-SHA256 against `DOCUSIGN_WEBHOOK_HMAC_KEY` | `envelope-completed` → flips quote to accepted (using `quoteId` custom field) |
| `/webhooks/stripe` | `stripe-signature` HMAC-SHA256 against `STRIPE_WEBHOOK_SIGNING_SECRET` | `invoice.paid`, `invoice.payment_failed` (extend the switch in `modules/webhooks/stripe.ts`) |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_quotes` | yes | DB | List quotes |
| `get_quote` | yes | DB | Get quote |
| `create_quote` | no | DB | Create draft |
| `add_line_item` / `remove_line_item` | mixed | DB | Edit lines |
| `apply_discount` | no | DB | Apply discount |
| `send_quote` | no | DB + **DocuSign** + **Resend** | Dispatch via signature OR plain email |
| `accept_quote` | no | DB + **Stripe** + **Resend** | Accept + invoice + notify |
| `list_products` / `list_pricing_rules` | yes | DB | Catalog read |
| `build_quote_from_requirements` | no | DB | Build a priced quote |
| `route_for_discount_approval` | yes | DB | Approval routing |
| `explain_pricing` | yes | DB | Price breakdown |

## The AI angle

The orchestrator trio — `build_quote_from_requirements`, `route_for_discount_approval`, `explain_pricing` — turns natural-language sales asks into headless CPQ work. An agent says "build a 12-seat enterprise quote for Acme valid 60 days," gets back a priced quote with rules trace and an approval verdict, then can call `send_quote` with a generated PDF to put it in the buyer's inbox via DocuSign — all without leaving the gateway. Same MCP tools work from Claude Desktop, an internal cron, or your own UI.

## Extending

- **Swap signature provider:** replace `modules/integrations/docusign.ts` with `adobesign.ts` (same shape, different REST endpoint and HMAC scheme).
- **Swap invoicing provider:** swap `modules/integrations/stripe.ts` for a Quickbooks adapter — the `accept_quote` handler imports change in one place.
- **Swap email provider:** replace `modules/integrations/resend.ts` with `postmark.ts`.
- **More webhook events:** extend the `switch (event.type)` in `modules/webhooks/stripe.ts` to handle subscription / dispute events.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

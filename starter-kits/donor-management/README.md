# Donor / Fundraising CRM API

Headless donor CRM that takes payments via Stripe, signs pledges with DocuSign, sends thank-yous and year-end receipts via Resend — all behind an MCP surface so an agent can run the whole donor lifecycle.

Replaces: Bloomerang, Blackbaud, DonorPerfect (lighter).

## Wires up

**Stripe Checkout** processes one-off donations and sustaining gifts; the kit creates Sessions, lets the donor pay on Stripe-hosted pages, and reconciles the local store via webhook. **DocuSign** sends pledge agreements for signature when a donor commits to multi-year giving. **Resend** powers the email side: acknowledgement after each donation, batched year-end receipts, and re-engagement emails for lapsed donors.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Stripe (Checkout sessions + signed webhook in)
                │                  ├── DocuSign (pledge envelopes)
                │                  └── Resend (ack / year-end / re-engagement)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/donor-management
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

Wire Stripe webhooks:

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

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — donation checkout + signed webhook
- `DOCUSIGN_BASE_URI`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_ACCESS_TOKEN` — pledge agreements
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — donor email

All three are independently optional. The kit boots zero-config for demos.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/donors` | List donors |
| POST | `/donors` | Create donor |
| GET | `/donors/{id}` | Get donor |
| GET | `/donations` | List donations |
| POST | `/donations` | Record donation manually |
| GET | `/campaigns` | List campaigns |
| POST | `/campaigns` | Create campaign |
| GET | `/pledges` | List pledges |
| POST | `/pledges` | Create pledge (DocuSign optional) |
| GET | `/recurring-gifts` | List recurring gifts |
| POST | `/start-donation-checkout` | Orchestrator: create Stripe Checkout Session |
| POST | `/identify-lapsed-donors` | Orchestrator: lapsed donors + Resend re-engagement |
| POST | `/segment-for-campaign` | Orchestrator: build segment |
| POST | `/generate-year-end-receipts` | Orchestrator: year-end totals + Resend batch |
| POST | `/webhooks/stripe` | Inbound Stripe events |
| POST | `/mcp` | MCP server endpoint |

## Webhooks (inbound)

| Path | Source | What it does |
|---|---|---|
| `/webhooks/stripe` | Stripe | Verifies `Stripe-Signature`. On `checkout.session.completed` records a `Donation` (one-off) or upserts a `RecurringGift` (subscription) and emails an acknowledgement via Resend. On `invoice.payment_succeeded` records the renewal donation + acknowledgement. On `customer.subscription.deleted` marks the local recurring gift canceled. |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_donors` | yes | — | List donors |
| `get_donor` | yes | — | Get donor |
| `create_donor` | no | — | Create donor |
| `list_donations` | yes | — | List donations |
| `record_donation` | no | — | Record a manual gift |
| `list_campaigns` | yes | — | List campaigns |
| `create_campaign` | no | — | Create campaign |
| `list_pledges` | yes | — | List pledges |
| `create_pledge` | no | DocuSign | Record a pledge, optionally send for signature |
| `list_recurring_gifts` | yes | — | List sustaining gifts |
| `start_donation_checkout` | no | Stripe | Create a Stripe Checkout Session for one-off or recurring |
| `identify_lapsed_donors` | yes | Resend (when `sendReengagement=true`) | Lapsed donors, optionally send re-engagement |
| `segment_for_campaign` | yes | — | Donor segment |
| `generate_year_end_receipts` | yes | Resend (when `email=true`) | Year-end totals, optionally batch-email |

## The AI angle

The realistic flow: an AI agent runs `start_donation_checkout` for a donor who's about to give (one-off or sustaining), Stripe handles the actual payment, the webhook flips the local row and fires a thank-you via Resend. For pledges, `create_pledge` with `sendForSignature=true` sends a DocuSign envelope. At year-end, the agent calls `generate_year_end_receipts` with `email=true` and the gateway batches the receipts via `POST /emails/batch`. For lapsed-donor outreach, the same pattern: `identify_lapsed_donors` with `sendReengagement=true` finds them and emails them in one MCP call.

## Extending

- **Add stock / DAF gifts:** extend `Donation.paymentMethod` and add a `record_stock_gift` orchestrator. Stripe Checkout doesn't cover those.
- **Webhooks for DocuSign:** add `/webhooks/docusign` to flip pledge `docusignStatus` to `completed` once the donor signs.
- **Tribute gifts:** add a `Tribute` field on Donation for "in honor of" / "in memory of".
- **Wealth scoring:** add a `wealth_screen` MCP tool that calls a 3rd-party (DonorSearch, iWave, etc.).
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

# Restaurant Reservations API

Headless reservations API that does the actual work — books the table, syncs to your shared Google Calendar, takes a deposit through Stripe Checkout when needed, and texts the guest a confirmation. Plus an MCP server an agent can drive to recover no-show revenue in real time.

Replaces: OpenTable, Resy, Tock.

## Wires up

- **Twilio SMS** — `create_reservation` texts the guest a confirmation; `recover_no_show_revenue` (with `notify=true`) texts waitlist parties when a no-show frees a table.
- **Google Calendar** — `create_reservation` adds the booking to the restaurant's shared calendar so the floor manager sees tonight's covers in the same calendar everyone else uses.
- **Stripe Checkout** — `create_reservation` mints a deposit Checkout Session when `depositCents > 0` (NYE, Valentine's, private rooms). The `/webhooks/stripe` route flips `depositStatus` from `pending` → `paid` on completion.

## Architecture at a glance

```
Guest / front-of-house ──▶ Zuplo Gateway ──▶ Integration handlers
                              │                  ├── Twilio          (confirmations + no-show recovery SMS)
                              │                  ├── Google Calendar (shared calendar event)
                              │                  └── Stripe Checkout (deposits + /webhooks/stripe)
                              ▼
                      Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/restaurant-reservations
cd restaurant-reservations
cp env.example .env
npm install
npm run dev
```

The gateway boots at `http://localhost:9000`. To explore the MCP server:

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

## Choosing a database

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) — default |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default — the kit boots without any credentials so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need:

- `RESTAURANT_NAME`, `RESTAURANT_TIMEZONE`, `RESTAURANT_CURRENCY` for SMS/calendar copy
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `GOOGLE_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ID`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (only when collecting deposits)

Each integration is best-effort: missing keys don't fail the booking, they just degrade silently and log.

## API surface

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| GET | `/guests` | `list_guests` | tool |
| POST | `/guests` | `create_guest` | tool |
| POST | `/optimize-floor-plan-for-shift` | `optimize_floor_plan_for_shift` | tool |
| POST | `/recognize-vip-guest` | `recognize_vip_guest` | tool |
| POST | `/recover-no-show-revenue` | `recover_no_show_revenue` | tool |
| GET | `/reservations` | `list_reservations` | tool |
| POST | `/reservations` | `create_reservation` | tool |
| GET | `/reservations/{id}` | `get_reservation` | tool |
| POST | `/reservations/{id}/no-show` | `mark_no_show` | tool |
| POST | `/reservations/{id}/seat` | `seat_reservation` | tool |
| GET | `/shifts` | `list_shifts` | tool |
| GET | `/tables` | `list_tables` | tool |
| POST | `/tables` | `create_table` | tool |
| GET | `/waitlist` | `list_waitlist` | tool |
| POST | `/waitlist` | `add_to_waitlist` | tool |
| POST | `/webhooks/stripe` | `webhook_stripe` | — |
| POST | `/mcp` | `mcp_handler` | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Provider | Behavior |
|---|---|---|
| `POST /webhooks/stripe` | Stripe | Verifies `Stripe-Signature` HMAC, then on `checkout.session.completed` flips `depositStatus` to `paid`; on `checkout.session.expired` / `charge.refunded` flips to `refunded`. |

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `create_reservation` | Twilio + Google Calendar + Stripe | Persist booking, add calendar event, mint deposit URL (if requested), text confirmation. |
| `recover_no_show_revenue` | Twilio | Match no-shows to waitlist; with `notify=true`, text the matched parties. |
| `optimize_floor_plan_for_shift` | — | Suggest table assignments for a shift. |
| `recognize_vip_guest` | — | Pre-arrival flag + notes for the manager. |
| (plus CRUD) | — | `list_reservations`, `get_reservation`, `seat_reservation`, `mark_no_show`, `list_tables`, `create_table`, `list_guests`, `create_guest`, `list_shifts`, `list_waitlist`, `add_to_waitlist`. |

## The AI angle

`create_reservation` does what a host previously did across three tools: write down the booking, add it to the calendar everyone shares, take the deposit when needed, then text the guest. One MCP call.

`recover_no_show_revenue` is the orchestrator that turns lost covers back into revenue — when a 7pm party doesn't show, the agent pages the longest-waiting compatible party from the waitlist with one tool call. The host still confirms and seats; the agent removes the latency.

## Extending

- **Swap SMS provider.** Replace `modules/integrations/twilio.ts` with MessageBird or Sinch — keep the `sendTwilioSms` shape.
- **Swap calendar provider.** Replace `modules/integrations/google-calendar.ts` with Microsoft Graph (Outlook) and update the calendar id semantics.
- **Push notifications.** Add a Firebase Cloud Messaging integration alongside Twilio for guests with the restaurant's app installed.
- **Day-of reminders.** Add a scheduled trigger (Cloudflare Cron / external scheduler) that calls a new `/internal/day-of-sms` route which lists today's confirmed bookings and re-uses `sendTwilioSms`.
- **Switch databases.** Change `DB_PROVIDER` in `.env`. Handler code never changes.

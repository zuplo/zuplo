# Event Ticketing API

Headless ticketing API. Manage events, ticket types, orders, issued tickets, gate check-ins, and discount codes — all behind a clean HTTP API and a paired MCP server. Drop it into your back-office app or hand the keys to an LLM agent that runs your front-of-house at event time.

Replaces: Eventbrite, Ticket Tailor.

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

See [env.example](./env.example).

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
| POST | `/orders` | Place an order |
| POST | `/orders/{id}/refund` | Refund an order |
| GET | `/tickets` | List issued tickets |
| POST | `/tickets/{id}/validate` | Validate (read-only) |
| POST | `/tickets/{id}/check-in` | Check in at the gate |
| GET | `/discounts` | List discount codes |
| POST | `/discounts` | Create discount code |
| POST | `/forecast-attendance` | Orchestrator: forecast |
| POST | `/issue-discount-for-segment` | Orchestrator: mint segment discount |
| POST | `/triage-refund-requests` | Orchestrator: refund triage |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_events` | yes | List events |
| `get_event` | yes | Fetch one event |
| `create_event` | no | Create draft event |
| `publish_event` | no | Move to on_sale |
| `cancel_event` | destructive | Cancel an event |
| `list_ticket_types` | yes | List ticket tiers |
| `create_ticket_type` | no | Create a tier |
| `list_orders` | yes | List orders |
| `place_order` | no | Place a new order |
| `refund_order` | destructive | Refund an order |
| `list_tickets` | yes | List issued tickets |
| `validate_ticket` | yes | Check ticket validity |
| `check_in_ticket` | no | Admit attendee |
| `list_discounts` | yes | List discount codes |
| `create_discount` | no | Create discount code |
| `forecast_attendance` | yes | Orchestrator — projected attendance |
| `issue_discount_for_segment` | no | Orchestrator — mint segment discount |
| `triage_refund_requests` | yes | Orchestrator — list pending refunds in window |

## The AI angle

Event ops are bursty. `forecast_attendance` lets an agent project sell-through from current velocity and decide on more inventory or a marketing push. `issue_discount_for_segment` lets the same agent mint a tagged code for a press list or alumni blast in one tool call. `triage_refund_requests` walks canceled-but-not-refunded orders inside a configurable cutoff window so refunds happen before the venue cuts off.

## Extending

- **Add waitlists:** new `Waitlist` entity + an `add_to_waitlist` orchestrator that promotes when a refund frees a ticket.
- **Add seat assignments:** add a `seat` field to `Ticket`, and a `seat_attendees` orchestrator that batches adjacent seats per order.
- **Add payment integration:** wrap `place_order` to call Stripe before persisting, and flip `paid` on webhook receipt.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

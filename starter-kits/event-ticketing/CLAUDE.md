# Event Ticketing Starter Kit

Headless event ticketing API. Replaces Eventbrite / Ticket Tailor. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Domain

| Entity | Purpose |
|---|---|
| `Order` | Primary entity. A ticket purchase placed by an attendee. |
| `Event` | The event tickets are sold for. |
| `TicketType` | A purchasable tier (General, VIP, Early Bird) under an event. |
| `Ticket` | An individual issued ticket with a unique QR code. |
| `Discount` | A discount code applied at checkout. |
| `CheckIn` | Audit record of when a ticket was scanned at a gate. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List events |
| POST | `/events` | Create draft event |
| GET | `/events/{id}` | Get event |
| PATCH | `/events/{id}/publish` | Move to on_sale |
| POST | `/events/{id}/cancel` | Cancel event (destructive) |
| GET | `/ticket-types` | List tiers |
| POST | `/ticket-types` | Create tier |
| GET | `/orders` | List orders |
| POST | `/orders` | Place order |
| POST | `/orders/{id}/refund` | Refund order (destructive) |
| GET | `/tickets` | List tickets |
| POST | `/tickets/{id}/validate` | Read-only validity check |
| POST | `/tickets/{id}/check-in` | Admit attendee |
| GET | `/discounts` | List discounts |
| POST | `/discounts` | Create discount |
| POST | `/forecast-attendance` | Orchestrator |
| POST | `/issue-discount-for-segment` | Orchestrator |
| POST | `/triage-refund-requests` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `forecast_attendance` — projects expected paid orders by `startsAt` from current velocity.
- `issue_discount_for_segment` — mints a percent-off code tagged with a segment name and returns the shareable code.
- `triage_refund_requests` — lists canceled-but-not-refunded orders for an event when start is within the configurable window.

## MCP tools registered

`list_events`, `get_event`, `create_event`, `publish_event`, `cancel_event`, `list_ticket_types`, `create_ticket_type`, `list_orders`, `place_order`, `refund_order`, `list_tickets`, `validate_ticket`, `check_in_ticket`, `list_discounts`, `create_discount`, `forecast_attendance`, `issue_discount_for_segment`, `triage_refund_requests`. Both layers (route-level `mcp` annotation and the `/mcp` `operations` array) agree.

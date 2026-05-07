# Scheduling & Booking Starter Kit

Headless scheduling/booking — event types, availability, bookings, reschedules, cancellations. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/event-types` | List event types |
| POST | `/event-types` | Create an event type |
| GET | `/event-types/{id}` | Get an event type |
| GET | `/bookings` | List bookings |
| POST | `/bookings` | Book a meeting |
| GET | `/bookings/{id}` | Get a booking |
| PATCH | `/bookings/{id}` | Reschedule a booking |
| PATCH | `/bookings/{id}/cancel` | Cancel a booking |
| GET | `/availability` | List availability windows |
| POST | `/availability` | Add an availability window |
| POST | `/get-available-slots` | Compute available slots |
| POST | `/find-mutual-slot` | Orchestrator: top 5 mutually-free slots |
| POST | `/reschedule-around-conflict` | Orchestrator: propose conflict-free time |
| POST | `/enforce-meeting-budget` | Orchestrator: per-host weekly budget check |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Booking` — primary, a scheduled meeting
- `EventType` — bookable template owned by a host
- `Availability` — recurring weekly windows per host
- `BufferRule` — extra padding around a host's meetings
- `Cancellation` — audit row written when a booking is canceled

## MCP tools registered

`list_event_types`, `get_event_type`, `create_event_type`, `list_bookings`, `get_booking`, `book_meeting`, `reschedule_booking`, `cancel_booking`, `list_availability`, `set_availability`, `get_available_slots`, `find_mutual_slot`, `reschedule_around_conflict`, `enforce_meeting_budget`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

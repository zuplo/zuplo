# Scheduling & Booking API

Headless scheduling/booking API backed by an MCP server. Manage event types, host availability, bookings, reschedules, and cancellations — and let an LLM find mutual slots, propose conflict-free reschedules, or enforce per-host meeting budgets.

Replaces: Calendly, Cal.com (data layer).

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/scheduling-booking
cd starter-kits/scheduling-booking
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
| POST | `/find-mutual-slot` | Orchestrator: top mutually-free slots |
| POST | `/reschedule-around-conflict` | Orchestrator: propose a conflict-free time |
| POST | `/enforce-meeting-budget` | Orchestrator: per-host weekly budget check |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_event_types` | yes | List event-type templates |
| `get_event_type` | yes | Get an event type by id |
| `create_event_type` | no | Create a bookable event type |
| `list_bookings` | yes | List bookings |
| `get_booking` | yes | Get a booking by id |
| `book_meeting` | no | Book a meeting at a specific time |
| `reschedule_booking` | no (idempotent) | Move a booking to a new time |
| `cancel_booking` | destructive | Cancel a booking and write audit row |
| `list_availability` | yes | List host availability windows |
| `set_availability` | no | Add a recurring availability window |
| `get_available_slots` | yes | Compute concrete bookable slots |
| `find_mutual_slot` | yes | Top 5 slots all listed hosts share |
| `reschedule_around_conflict` | yes | Propose next free slot for a host |
| `enforce_meeting_budget` | yes | Check weekly meeting budget for a host |

## The AI angle

`find_mutual_slot` is the headline. Instead of teaching an agent to fan out across `/availability` and `/bookings` for every host, intersect the windows in TypeScript, and pick the top 5 by hand, it gets one tool that does the math and returns ranked slots. Pair with `reschedule_around_conflict` to gracefully move existing meetings, and `enforce_meeting_budget` to keep an exec from being booked into the ground.

## Extending

- **Group bookings**: add a `participants[]` array to `Booking` and broaden conflict checks in `get-available-slots`.
- **Round-robin pooling**: assign a single event type to multiple hosts; the orchestrator picks the host with most free time.
- **Calendar sync**: add a webhook from Google Calendar to call `cancel_booking` when an external decline lands.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.

# Scheduling & Booking API

A real Calendly replacement: book a meeting and the gateway creates the Google Calendar event, spins up a Zoom (or Google Meet) link, and texts the attendee a confirmation — all in one MCP tool call.

Replaces: Calendly, Cal.com, Acuity.

## Wires up

Google Calendar holds the truth — every booking creates an event with both host and attendee on it; cancels delete it. Zoom (server-to-server OAuth) creates the actual meeting room when the booker picks `conference: "zoom"`; for `google_meet` the kit asks Calendar to provision a Hangouts Meet on the same insert. Twilio sends an SMS to the attendee with the join link the moment the booking lands. The orchestrator MCP tools (`find_mutual_slot`, `reschedule_around_conflict`, `enforce_meeting_budget`) read the data layer and shape ranked time slots for an LLM caller.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ /book-meeting handler
                │                  │
                │                  ├──▶ Zoom (S2S OAuth ─▶ /users/me/meetings)
                │                  ├──▶ Google Calendar (events.insert + Meet)
                │                  ├──▶ Twilio (SMS confirmation)
                │                  └──▶ Bookings repository
                ▼
         /mcp ──▶ MCP server ──▶ orchestrator tools (find_mutual_slot, …)
                                   │
                                   └──▶ DB adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/scheduling-booking
cd scheduling-booking
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

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- **Google Calendar** — `GOOGLE_CALENDAR_ACCESS_TOKEN` (OAuth2 access token, refresh externally), optional `GOOGLE_CALENDAR_ID` (defaults to `primary`).
- **Zoom** — `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` from a Server-to-Server OAuth app.
- **Twilio** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.

If any integration is unset and a booking still requests it (e.g. `conference: "zoom"`), the booking is recorded but the response includes a `sideEffectErrors` object listing what failed. The DB row is the source of truth.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/event-types` | List event types |
| POST | `/event-types` | Create an event type |
| GET | `/event-types/{id}` | Get an event type |
| GET | `/bookings` | List bookings |
| POST | `/bookings` | Book a meeting (creates Calendar event + optional Zoom + SMS) |
| GET | `/bookings/{id}` | Get a booking |
| PATCH | `/bookings/{id}` | Reschedule a booking |
| PATCH | `/bookings/{id}/cancel` | Cancel a booking (deletes Calendar event + Zoom + SMS notice) |
| GET | `/availability` | List availability windows |
| POST | `/availability` | Add an availability window |
| POST | `/get-available-slots` | Compute available slots |
| POST | `/find-mutual-slot` | Orchestrator: top mutually-free slots |
| POST | `/reschedule-around-conflict` | Orchestrator: propose a conflict-free time |
| POST | `/enforce-meeting-budget` | Orchestrator: per-host weekly budget check |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `list_event_types`, `get_event_type`, `create_event_type`, `list_bookings`, `get_booking`, `list_availability`, `set_availability`, `get_available_slots` | DB | CRUD over the booking model. |
| `book_meeting` | DB + Google Calendar + Zoom + Twilio | Create a booking, drop a Calendar event with attendees, optionally provision a Zoom room or Meet link, and SMS the attendee. |
| `reschedule_booking` | DB | Move a booking to a new time. |
| `cancel_booking` | DB + Google Calendar + Zoom + Twilio | Cancel + delete the Calendar event and Zoom meeting; SMS the attendee. |
| `find_mutual_slot` | DB | Top 5 slots all listed hosts share. |
| `reschedule_around_conflict` | DB | Propose next free slot for a host. |
| `enforce_meeting_budget` | DB | Check weekly meeting budget for a host. |

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

`book_meeting` is what makes this a real product instead of a CRUD shell. From a Claude Desktop session, an internal Slack bot, or your own UI, one MCP call lands the booking, creates the calendar entry, provisions the video room, and texts the attendee. Pair with `find_mutual_slot` so the agent can pick a time across multiple hosts before booking, and `reschedule_around_conflict` when something blows up.

## Extending

- **Swap Zoom for Google Meet only**: omit Zoom env vars and pass `conference: "google_meet"` — Calendar will provision a Meet link via `conferenceData.createRequest`. Same flow.
- **Swap Twilio for MessageBird/Vonage**: replace `modules/integrations/twilio.ts` with one that hits the alternate provider's REST endpoint. The handler's `sendTwilioSms(...)` call is a single function.
- **Calendar provider**: swap `modules/integrations/google-calendar.ts` for an Outlook/Microsoft Graph version. Same shape, different URL.
- **Group bookings**: add a `participants[]` array to `Booking` and broaden conflict checks in `get-available-slots`.
- **Round-robin pooling**: assign a single event type to multiple hosts; the orchestrator picks the host with most free time.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.

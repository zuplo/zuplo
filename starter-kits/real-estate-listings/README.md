# Real Estate / Property Listings API

Listings, leads, showings, and offers — wired so the moment a new lead lands, Resend confirms with the prospect *and* notifies the agent; the moment a showing is scheduled, Google Calendar gets an event and Twilio texts the lead the address and time.

Replaces: Follow Up Boss, kvCORE.

## Wires up

Resend handles transactional email — `create_lead` sends a "thanks for reaching out" to the prospect and a structured "new lead" notification to the assigned agent in one handler. Google Calendar holds the showing schedule — every `schedule_showing` creates a calendar event with the listing address as location and both agent + lead as attendees. Twilio sends the lead an SMS confirmation with the time and street address. Cancel a showing? The Calendar event is deleted (when extended in `complete_showing` etc.). Orchestrators read across leads/listings/showings to match buyers to inventory and propose showing rounds.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Handlers
                │                  ├── create_lead     ──▶ Resend (lead confirm)
                │                  │                    └▶ Resend (agent notification)
                │                  ├── schedule_showing ──▶ Google Calendar
                │                  │                    └▶ Twilio (lead SMS)
                │                  └── DB adapter (Supabase / Firestore / Neon / Upstash)
                ▼
         /mcp ──▶ MCP server ──▶ orchestrator tools
                                   ├── match_lead_to_listings
                                   ├── draft_offer_summary
                                   └── schedule_showing_round
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/real-estate-listings
cd real-estate-listings
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

This kit ships with HTTP-only adapters (the kits run in Zuplo's edge runtime — no TCP drivers). Set `DB_PROVIDER` in `.env` to one of:

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default — the kit boots without any credentials so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- **Google Calendar** — `GOOGLE_CALENDAR_ACCESS_TOKEN` (OAuth2 access token, refresh externally), optional `GOOGLE_CALENDAR_ID`.
- **Twilio** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.
- **Resend** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

If any integration is unset, the lead/showing record is still saved; the response includes a `sideEffectErrors` object so the caller can retry.

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| POST | `/accept-offer` | `accept_offer` | Accept Offer | tool |
| POST | `/attach-document` | `attach_document` | Attach Document | tool |
| GET | `/documents` | `list_documents` | List Documents | tool |
| POST | `/draft-offer-summary` | `draft_offer_summary` | Draft Offer Summary | tool |
| POST | `/lead` | `create_lead` | Create Lead (Resend confirm + notify agent) | tool |
| PATCH | `/lead-stage/{id}` | `update_lead_stage` | Update Lead Stage | tool |
| GET | `/leads` | `list_leads` | List Leads | tool |
| POST | `/listing` | `create_listing` | Create Listing | tool |
| GET | `/listing/{id}` | `get_listing` | Get Listing | tool |
| PATCH | `/listing/{id}` | `update_listing` | Update Listing | tool |
| POST | `/listing/{id}/withdraw` | `withdraw_listing` | Withdraw Listing | tool |
| GET | `/listings` | `list_listings` | List Listings | tool |
| POST | `/match-lead-to-listings` | `match_lead_to_listings` | Match Lead To Listings | tool |
| POST | `/offer/{id}/submit` | `submit_offer` | Submit Offer | tool |
| GET | `/offers` | `list_offers` | List Offers | tool |
| POST | `/schedule-showing-round` | `schedule_showing_round` | Schedule Showing Round | tool |
| POST | `/showing/{id}/complete` | `complete_showing` | Complete Showing | tool |
| POST | `/showing/{id}/schedule` | `schedule_showing` | Schedule Showing (Calendar event + SMS) | tool |
| GET | `/showings` | `list_showings` | List Showings | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| CRUD: `accept_offer`, `attach_document`, `complete_showing`, `create_listing`, `get_listing`, `update_listing`, `list_documents`, `list_leads`, `list_listings`, `list_offers`, `list_showings`, `submit_offer`, `update_lead_stage`, `withdraw_listing` | DB | Standard reads/writes. |
| `create_lead` | DB + Resend | Save the lead AND send confirmation email to prospect AND notification to agent. |
| `schedule_showing` | DB + Google Calendar + Twilio | Save the showing, drop a calendar event for agent + lead, and SMS the lead with the time + address. |
| `draft_offer_summary` | DB | Pull offer + listing + lead and shape a one-screen summary the LLM can refine. |
| `match_lead_to_listings` | DB | Score the lead against active listings using budget + bedrooms + area. |
| `schedule_showing_round` | DB | Suggest a back-to-back showing schedule for a lead across multiple listings. |

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

The agent loop is concrete: an inbound web form posts to `create_lead`, which triggers Resend (instant credibility for the prospect, fresh queue item for the agent), then `match_lead_to_listings` returns ranked properties, and `schedule_showing` books each one — Calendar + SMS in a single call. The orchestrators (`match_lead_to_listings`, `schedule_showing_round`, `draft_offer_summary`) are designed for an LLM to compose; the side effects are designed to actually move the deal.

## Extending

- **Swap Resend for Postmark/SendGrid**: replace `modules/integrations/resend.ts`. The handler call is a single function.
- **Swap Twilio**: replace `modules/integrations/twilio.ts` with MessageBird/Vonage/Plivo. Same shape.
- **Calendar provider**: replace `modules/integrations/google-calendar.ts` with Outlook/Microsoft Graph.
- **MLS sync**: add a webhook from your MLS RETS feed and a handler that upserts listings.
- **New entity**: add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **Switch databases**: change `DB_PROVIDER` in `.env` — the handlers don't change.

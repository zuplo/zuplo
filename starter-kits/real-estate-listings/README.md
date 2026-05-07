# Real Estate / Property Listings API

Listings, leads, showings, and offers with MCP tools that match leads to listings, draft offer summaries, and schedule showing rounds.

**Replaces:** Follow Up Boss, kvCORE.
**SEO target:** "api for real estate listings".

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

See [env.example](./env.example).

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| POST | `/accept-offer` | `accept_offer` | Accept Offer | tool |
| POST | `/attach-document` | `attach_document` | Attach Document | tool |
| GET | `/documents` | `list_documents` | List Documents | tool |
| POST | `/draft-offer-summary` | `draft_offer_summary` | Draft Offer Summary | tool |
| POST | `/lead` | `create_lead` | Create Lead | tool |
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
| POST | `/showing/{id}/schedule` | `schedule_showing` | Schedule Showing | tool |
| GET | `/showings` | `list_showings` | List Showings | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

19 tools registered: `accept_offer`, `attach_document`, `complete_showing`, `create_lead`, `create_listing`, `get_listing`, `update_listing`, `list_documents`, `list_leads`, `list_listings`, `list_offers`, `list_showings`, `schedule_showing`, `submit_offer`, `update_lead_stage`, `withdraw_listing`, `draft_offer_summary`, `match_lead_to_listings`, `schedule_showing_round`.

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

The orchestrator MCP tools shipped with this kit are where the agentic value compounds — they read multi-source signals through `context.invokeRoute()` and shape the response for an LLM, rather than dumping raw rows. Agents work best when they can call a few purposeful tools (`triage_x`, `summarize_x`, `flag_x`) instead of every CRUD endpoint.

Per the [conventions doc](../CLAUDE.md), every CRUD endpoint inherits `api-key-inbound` + `rate-limit` policies, and the `/mcp` route adds `prompt-injection-outbound` + `secret-masking-outbound` defenses for AI traffic.

## Extending

- **New entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **New endpoint:** add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **New orchestrator MCP tool:** drop a file in `modules/mcp-tools/` that uses `invokeJson` from `../_shared/mcp/helpers.ts` to compose existing endpoints. Pass the inbound `authorization` header through so the inner calls re-run policies.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.

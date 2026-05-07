# Real Estate / Property Listings API

Listings, leads, showings, and offers with MCP tools that match leads to listings, draft offer summaries, and schedule showing rounds.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/accept-offer` | `accept_offer` | tool |
| POST | `/attach-document` | `attach_document` | tool |
| GET | `/documents` | `list_documents` | tool |
| POST | `/draft-offer-summary` | `draft_offer_summary` | tool |
| POST | `/lead` | `create_lead` | tool |
| PATCH | `/lead-stage/{id}` | `update_lead_stage` | tool |
| GET | `/leads` | `list_leads` | tool |
| POST | `/listing` | `create_listing` | tool |
| GET | `/listing/{id}` | `get_listing` | tool |
| PATCH | `/listing/{id}` | `update_listing` | tool |
| POST | `/listing/{id}/withdraw` | `withdraw_listing` | tool |
| GET | `/listings` | `list_listings` | tool |
| POST | `/match-lead-to-listings` | `match_lead_to_listings` | tool |
| POST | `/offer/{id}/submit` | `submit_offer` | tool |
| GET | `/offers` | `list_offers` | tool |
| POST | `/schedule-showing-round` | `schedule_showing_round` | tool |
| POST | `/showing/{id}/complete` | `complete_showing` | tool |
| POST | `/showing/{id}/schedule` | `schedule_showing` | tool |
| GET | `/showings` | `list_showings` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

19 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `accept_offer`
- `attach_document`
- `complete_showing`
- `create_lead`
- `create_listing`
- `get_listing`
- `update_listing`
- `list_documents`
- `list_leads`
- `list_listings`
- `list_offers`
- `list_showings`
- `schedule_showing`
- `submit_offer`
- `update_lead_stage`
- `withdraw_listing`
- `draft_offer_summary`
- `match_lead_to_listings`
- `schedule_showing_round`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 19 entries above.

## Replaces

- Follow Up Boss
- kvCORE

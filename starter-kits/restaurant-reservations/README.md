# Restaurant Reservations API

Reservations, tables, guests, and waitlists with MCP tools that optimize floor plans for shifts, recognize VIP guests, and recover no-show revenue.

**Replaces:** OpenTable, Resy, Tock.
**SEO target:** "api for restaurant reservations".

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
| GET | `/guests` | `list_guests` | List guests in the current tenant | tool |
| POST | `/guests` | `create_guest` | Create a guest | tool |
| POST | `/optimize-floor-plan-for-shift` | `optimize_floor_plan_for_shift` | Optimize floor plan for a shift (orchestrator) | tool |
| POST | `/recognize-vip-guest` | `recognize_vip_guest` | Recognize VIP guest from reservation (orchestrator) | tool |
| POST | `/recover-no-show-revenue` | `recover_no_show_revenue` | Recover no-show revenue (orchestrator) | tool |
| GET | `/reservations` | `list_reservations` | List reservations in the current tenant | tool |
| POST | `/reservations` | `create_reservation` | Create a reservation | tool |
| GET | `/reservations/{id}` | `get_reservation` | Get a reservation | tool |
| POST | `/reservations/{id}/no-show` | `mark_no_show` | Mark a reservation as a no-show | tool |
| POST | `/reservations/{id}/seat` | `seat_reservation` | Seat a reservation | tool |
| GET | `/shifts` | `list_shifts` | List shifts | tool |
| GET | `/tables` | `list_tables` | List tables in the current tenant | tool |
| POST | `/tables` | `create_table` | Create a table | tool |
| GET | `/waitlist` | `list_waitlist` | List the active waitlist | tool |
| POST | `/waitlist` | `add_to_waitlist` | Add a party to the waitlist | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

15 tools registered: `list_reservations`, `create_reservation`, `get_reservation`, `seat_reservation`, `mark_no_show`, `list_tables`, `create_table`, `list_guests`, `create_guest`, `list_shifts`, `list_waitlist`, `add_to_waitlist`, `optimize_floor_plan_for_shift`, `recognize_vip_guest`, `recover_no_show_revenue`.

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

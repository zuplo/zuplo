# Restaurant Reservations API

Reservations, tables, guests, and waitlists with MCP tools that optimize floor plans for shifts, recognize VIP guests, and recover no-show revenue.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

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
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

15 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `list_reservations`
- `create_reservation`
- `get_reservation`
- `seat_reservation`
- `mark_no_show`
- `list_tables`
- `create_table`
- `list_guests`
- `create_guest`
- `list_shifts`
- `list_waitlist`
- `add_to_waitlist`
- `optimize_floor_plan_for_shift`
- `recognize_vip_guest`
- `recover_no_show_revenue`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 15 entries above.

## Replaces

- OpenTable
- Resy
- Tock

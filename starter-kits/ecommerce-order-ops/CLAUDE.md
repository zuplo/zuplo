# E-commerce Order Ops API

Orders, shipments, returns, and inventory with MCP tools that triage high-risk orders, pick carriers, and auto-approve returns under policy.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/auto-approve-returns-under-policy` | `auto_approve_returns_under_policy` | tool |
| GET | `/customers` | `list_customers` | tool |
| GET | `/inventory-adjustments` | `list_inventory_adjustments` | tool |
| POST | `/inventory-adjustments` | `adjust_inventory` | tool |
| GET | `/orders` | `list_orders` | tool |
| POST | `/orders` | `create_order` | tool |
| GET | `/orders/{id}` | `get_order` | tool |
| POST | `/orders/{id}/cancel` | `cancel_order` | tool |
| POST | `/pick-carrier-for-destination` | `pick_carrier_for_destination` | tool |
| GET | `/returns` | `list_returns` | tool |
| POST | `/returns` | `request_return` | tool |
| POST | `/returns/{id}/approve` | `approve_return` | tool |
| PATCH | `/returns/{id}/received` | `mark_received` | tool |
| POST | `/returns/{id}/refund` | `refund_return` | tool |
| GET | `/shipments` | `list_shipments` | tool |
| POST | `/shipments` | `create_shipment` | tool |
| PATCH | `/shipments/{id}/delivered` | `mark_delivered` | tool |
| PATCH | `/shipments/{id}/in-transit` | `mark_shipment_in_transit` | tool |
| POST | `/triage-high-risk-orders` | `triage_high_risk_orders` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

19 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `list_orders`
- `create_order`
- `get_order`
- `cancel_order`
- `list_shipments`
- `create_shipment`
- `mark_shipment_in_transit`
- `mark_delivered`
- `list_returns`
- `request_return`
- `approve_return`
- `mark_received`
- `refund_return`
- `list_customers`
- `list_inventory_adjustments`
- `adjust_inventory`
- `triage_high_risk_orders`
- `pick_carrier_for_destination`
- `auto_approve_returns_under_policy`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 19 entries above.

## Replaces

- ShipStation
- Order Desk

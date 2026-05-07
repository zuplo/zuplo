# E-commerce Order Ops API

Headless OMS for online retailers. Manage orders, shipments, returns, customers, and inventory adjustments through a clean HTTP API + paired MCP server. Drop it into your storefront stack or hand the keys to an LLM agent that runs your back-of-house at scale.

Replaces: ShipStation, Order Desk, custom OMS code.

## Quickstart

```bash
cd starter-kits/ecommerce-order-ops
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

See [env.example](./env.example).

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders` | List orders |
| POST | `/orders` | Create an order |
| GET | `/orders/{id}` | Get an order |
| POST | `/orders/{id}/cancel` | Cancel an order |
| GET | `/shipments` | List shipments |
| POST | `/shipments` | Create a shipment |
| PATCH | `/shipments/{id}/in-transit` | Mark shipment in transit |
| PATCH | `/shipments/{id}/delivered` | Mark shipment delivered |
| GET | `/returns` | List returns |
| POST | `/returns` | Request a return |
| POST | `/returns/{id}/approve` | Approve a return |
| PATCH | `/returns/{id}/received` | Mark return received |
| POST | `/returns/{id}/refund` | Refund a return |
| GET | `/customers` | List customers |
| GET | `/inventory-adjustments` | List inventory adjustments |
| POST | `/inventory-adjustments` | Adjust inventory |
| POST | `/triage-high-risk-orders` | Orchestrator |
| POST | `/pick-carrier-for-destination` | Orchestrator |
| POST | `/auto-approve-returns-under-policy` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_orders` | yes | List orders |
| `get_order` | yes | Fetch one order |
| `create_order` | no | Create order |
| `cancel_order` | destructive | Cancel order |
| `list_shipments` | yes | List shipments |
| `create_shipment` | no | Create shipment |
| `mark_shipment_in_transit` | no | Mark in transit |
| `mark_delivered` | no | Mark delivered |
| `list_returns` | yes | List returns |
| `request_return` | no | Open return |
| `approve_return` | no | Approve return |
| `mark_received` | no | Mark received |
| `refund_return` | no | Refund return |
| `list_customers` | yes | List customers |
| `list_inventory_adjustments` | yes | List adjustments |
| `adjust_inventory` | no | Record adjustment |
| `triage_high_risk_orders` | yes | Orchestrator — fraud holds |
| `pick_carrier_for_destination` | yes | Orchestrator — carrier picker |
| `auto_approve_returns_under_policy` | no | Orchestrator — bulk approvals |

## The AI angle

Order ops is rule-driven and bursty. `triage_high_risk_orders` lets an agent walk paid-but-unshipped orders above a fraud threshold and queue them for review. `pick_carrier_for_destination` codifies "what carrier do we use" rules so the same agent can pick the right service per order without humans reasoning each time. `auto_approve_returns_under_policy` handles the long tail of small returns inside policy without bothering anyone.

## Extending

- **Add reservations:** add a `Reservation` entity that decrements stock on `paid` and releases on `canceled`.
- **Add channels:** wire Shopify/Amazon/eBay webhooks into `create_order` so all channels flow through one OMS.
- **Add address validation:** new orchestrator that calls `pick_carrier_for_destination` plus a USPS lookup before label purchase.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

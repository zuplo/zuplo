# Procurement / Purchase Order API

Headless procurement API. Lets employees raise purchase requests, routes them through approval, issues POs, captures receiving, and reconciles invoices to open POs. Designed to be embedded in your back-office app or controlled by an LLM agent.

Replaces: Coupa, Procurify, Airbase procurement.

## Quickstart

```bash
cd starter-kits/procurement-po
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

## Environment variables

See [env.example](./env.example).

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/purchase-requests` | List purchase requests |
| POST | `/purchase-requests` | Create purchase request |
| GET | `/purchase-requests/{id}` | Get purchase request |
| PATCH | `/purchase-requests/{id}/submit` | Submit for approval |
| POST | `/purchase-requests/{id}/approve` | Approve |
| POST | `/purchase-requests/{id}/reject` | Reject |
| POST | `/purchase-requests/{id}/convert-to-po` | Issue PO |
| GET | `/purchase-orders` | List POs |
| POST | `/receipts` | Record a receipt |
| GET | `/vendors` | List vendors |
| POST | `/route-request-for-approval` | Orchestrator: build approval chain |
| POST | `/flag-maverick-spend` | Orchestrator: surface policy bypass |
| POST | `/match-invoice-to-po` | Orchestrator: 3-way match candidates |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_purchase_requests` | yes | List purchase requests |
| `get_purchase_request` | yes | Get one |
| `create_purchase_request` | no | Raise a new request |
| `submit_purchase_request` | no | Move draft → submitted |
| `approve_purchase_request` | no | Approve |
| `reject_purchase_request` | destructive | Reject |
| `convert_to_po` | no | Issue PO |
| `list_purchase_orders` | yes | List POs |
| `record_receipt` | no | Receive against a PO |
| `list_vendors` | yes | List vendors |
| `route_request_for_approval` | no | Orchestrator — build approval chain |
| `flag_maverick_spend` | yes | Orchestrator — flag policy bypass |
| `match_invoice_to_po` | yes | Orchestrator — 3-way match |

## The AI angle

Procurement is a workflow problem and workflows want agents. `route_request_for_approval` lets the LLM build the right chain from cost-center + dollar threshold without a hard-coded SOX rule library. `flag_maverick_spend` lets it audit incoming requests for rush flags / thin justification before they ever reach an approver. `match_invoice_to_po` lets it pre-suggest 3-way matches when AP scans a vendor invoice.

## Extending

- **Budget guardrails:** wire a budget repository and reject requests that bust the cost-center budget.
- **Vendor onboarding workflow:** add `pending_w9` and `tax_form_received` events on `Vendor`.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

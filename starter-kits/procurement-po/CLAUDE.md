# Procurement / Purchase Order Starter Kit

Headless procurement API for purchase requests, approvals, POs, receiving, and 3-way matching. See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `PurchaseRequest` | Pre-PO request raised by an employee. |
| `PurchaseOrder` | Issued PO derived from an approved request. |
| `Vendor` | Vendor masterdata. |
| `Receipt` | Goods/services receiving record against a PO. |
| `ApprovalStep` | One step in an approval chain on a request. |

## Routes

| Method | Path | Tool |
|--------|------|------|
| GET | `/purchase-requests` | `list_purchase_requests` |
| POST | `/purchase-requests` | `create_purchase_request` |
| GET | `/purchase-requests/{id}` | `get_purchase_request` |
| PATCH | `/purchase-requests/{id}/submit` | `submit_purchase_request` |
| POST | `/purchase-requests/{id}/approve` | `approve_purchase_request` |
| POST | `/purchase-requests/{id}/reject` | `reject_purchase_request` (destructive) |
| POST | `/purchase-requests/{id}/convert-to-po` | `convert_to_po` |
| GET | `/purchase-orders` | `list_purchase_orders` |
| POST | `/receipts` | `record_receipt` |
| GET | `/vendors` | `list_vendors` |
| POST | `/route-request-for-approval` | Orchestrator |
| POST | `/flag-maverick-spend` | Orchestrator |
| POST | `/match-invoice-to-po` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `route_request_for_approval` — read dollar threshold + cost center, build chain, persist `ApprovalStep` rows.
- `flag_maverick_spend` — surface PRs that bypass policy (rush, thin justification on big spend).
- `match_invoice_to_po` — given vendor + invoice amount, find open POs within tolerance.

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.

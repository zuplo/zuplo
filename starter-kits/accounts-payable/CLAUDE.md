# Accounts Payable Starter Kit

Headless AP / bill-pay — bills, vendors, approvals, payments. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/bills` | List bills |
| POST | `/bills` | Create draft bill |
| GET | `/bills/{id}` | Get bill |
| PATCH | `/bills/{id}/route-for-approval` | Route for approval |
| PATCH | `/bills/{id}/approve` | Approve a bill |
| PATCH | `/bills/{id}/reject` | Reject a bill (destructive) |
| POST | `/bill-payments` | Schedule a payment |
| GET | `/vendors` | List vendors |
| POST | `/vendors` | Create vendor |
| POST | `/detect-duplicate-bills` | Orchestrator: detect duplicates |
| POST | `/summarize-payable-aging` | Orchestrator: AP aging buckets |
| POST | `/match-bill-to-po` | Orchestrator: PO match candidates |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Bill` — primary
- `Vendor` — billing source
- `BillApproval` — audit row per approval/rejection decision
- `BillPayment` — scheduled or completed payments

## MCP tools registered

`list_bills`, `get_bill`, `create_bill`, `route_for_approval`, `approve_bill`, `reject_bill`, `schedule_payment`, `list_vendors`, `create_vendor`, `detect_duplicate_bills`, `summarize_payable_aging`, `match_bill_to_po`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

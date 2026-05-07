# Invoicing Starter Kit

Headless invoicing — issue, send, void, chase. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/invoices` | List invoices |
| POST | `/invoices` | Create a draft invoice |
| GET | `/invoices/{id}` | Get an invoice |
| PATCH | `/invoices/{id}/send` | Mark invoice sent |
| PATCH | `/invoices/{id}/void` | Void an invoice |
| POST | `/payments` | Record a payment |
| GET | `/customers` | List customers |
| POST | `/customers` | Create a customer |
| POST | `/chase-overdue-invoices` | Orchestrator: chase overdue with draft emails |
| POST | `/summarize-ar-aging` | Orchestrator: AR aging buckets |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Invoice` — primary
- `Customer` — billing target
- `LineItem` — invoice rows
- `Payment` — payments recorded against an invoice

## MCP tools registered

`list_invoices`, `get_invoice`, `create_invoice`, `send_invoice`, `void_invoice`, `record_payment`, `list_customers`, `create_customer`, `chase_overdue_invoices`, `summarize_ar_aging`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

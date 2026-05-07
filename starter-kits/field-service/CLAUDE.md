# Field Service / Inspection API

Jobs, technicians, inspections, and invoices with MCP tools that optimize routes, flag recurring failures at sites, and draft estimates from inspections.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/checklists` | `submit_checklist` | tool |
| GET | `/customers` | `list_customers` | tool |
| POST | `/customers` | `create_customer` | tool |
| POST | `/draft-estimate-from-inspection` | `draft_estimate_from_inspection` | tool |
| POST | `/flag-recurring-failures-at-site` | `flag_recurring_failures_at_site` | tool |
| POST | `/inspections` | `submit_inspection` | tool |
| GET | `/invoices` | `list_invoices` | tool |
| POST | `/invoices` | `create_invoice` | tool |
| GET | `/jobs` | `list_jobs` | tool |
| POST | `/jobs` | `create_job` | tool |
| GET | `/jobs/{id}` | `get_job` | tool |
| POST | `/jobs/{id}/complete` | `complete_job` | tool |
| POST | `/optimize-route-for-day` | `optimize_route_for_day` | tool |
| POST | `/photos` | `upload_photo` | tool |
| GET | `/technicians` | `list_technicians` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

15 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `list_jobs`
- `create_job`
- `get_job`
- `complete_job`
- `list_customers`
- `create_customer`
- `list_technicians`
- `submit_inspection`
- `upload_photo`
- `submit_checklist`
- `list_invoices`
- `create_invoice`
- `optimize_route_for_day`
- `flag_recurring_failures_at_site`
- `draft_estimate_from_inspection`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 15 entries above.

## Replaces

- ServiceTitan
- Jobber
- Housecall Pro

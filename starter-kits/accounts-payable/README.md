# Accounts Payable / Bill Pay API

Headless AP and bill-pay backed by an MCP server. Manage bills, vendors, approvals, and scheduled payments — and let an LLM detect duplicate bills, age payables, and match invoices to POs.

Replaces: Bill.com, Melio, Tipalti.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/accounts-payable
cd starter-kits/accounts-payable
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

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example). The kit boots with `DB_PROVIDER=in-memory` and zero other env vars.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/bills` | List bills |
| POST | `/bills` | Create draft bill |
| GET | `/bills/{id}` | Get bill |
| PATCH | `/bills/{id}/route-for-approval` | Send for approval |
| PATCH | `/bills/{id}/approve` | Approve a bill |
| PATCH | `/bills/{id}/reject` | Reject a bill (destructive) |
| POST | `/bill-payments` | Schedule a payment |
| GET | `/vendors` | List vendors |
| POST | `/vendors` | Create vendor |
| POST | `/detect-duplicate-bills` | Orchestrator: detect duplicates |
| POST | `/summarize-payable-aging` | Orchestrator: AP aging buckets |
| POST | `/match-bill-to-po` | Orchestrator: PO match candidates |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_bills` | yes | List bills |
| `get_bill` | yes | Get bill by id |
| `create_bill` | no | Create a draft bill |
| `route_for_approval` | no (idempotent) | Move bill to pending_approval |
| `approve_bill` | no | Approve, write audit row |
| `reject_bill` | destructive | Reject and void |
| `schedule_payment` | no | Schedule a future payment |
| `list_vendors` | yes | List vendors |
| `create_vendor` | no | Create a vendor |
| `detect_duplicate_bills` | yes | Find suspect duplicate clusters |
| `summarize_payable_aging` | yes | AP aging buckets 0-30/31-60/61-90/90+ |
| `match_bill_to_po` | yes | Suggest PO matches within ±5% |

## The AI angle

`detect_duplicate_bills` and `match_bill_to_po` are the headline tools. AP duplicate detection and 3-way match are exactly the kind of fuzzy-rule work an LLM is bad at and a deterministic gateway tool is good at. The agent gets structured candidates back and decides whether to ask a human or call `reject_bill` / `approve_bill`.

## Extending

- **OCR**: add a `parse_bill_attachment` MCP tool that takes `attachmentUrl` and pre-fills `billNumber`, `amountCents`, `dueDate`.
- **PO entity**: split POs into their own table instead of overloading `Bill.poNumber`.
- **Multi-step approvals**: extend `BillApproval` so multiple approvers must sign off before status flips.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.

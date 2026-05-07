# Invoicing API

Headless invoicing API backed by an MCP server. Issue invoices, send them, record payments, void mistakes, and let an LLM chase what's overdue.

Replaces: QuickBooks Invoicing, FreshBooks, Wave.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/invoicing
cd starter-kits/invoicing
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

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_invoices` | yes | List invoices |
| `get_invoice` | yes | Get invoice by id |
| `create_invoice` | no | Create a draft invoice |
| `send_invoice` | no (idempotent) | Move draft → sent |
| `void_invoice` | destructive | Void an invoice |
| `record_payment` | no | Record a payment, mark invoice paid |
| `list_customers` | yes | List customers |
| `create_customer` | no | Create a customer |
| `chase_overdue_invoices` | yes | Per-invoice chase row + draft email |
| `summarize_ar_aging` | yes | Buckets 0-30/31-60/61-90/90+ |

## The AI angle

`chase_overdue_invoices` is the headline. Instead of teaching an agent to paginate `/invoices`, filter by `dueDate < now`, join `/customers`, and write 50 emails by hand, it gets one tool that returns a structured chase list with a draft email per invoice. The LLM rewrites for tone and sends — the gateway does the heavy lifting and inherits API key auth + rate-limit on the way.

## Extending

- **Recurring invoices**: add a `Subscription` entity and a cron-like trigger that calls `create_invoice`.
- **Tax engines**: swap `taxCents` for a per-line-item rate and compute via a domain helper.
- **Stripe sync**: add a webhook route that calls `record_payment` when Stripe fires `invoice.payment_succeeded`.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.

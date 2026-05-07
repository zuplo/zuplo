# Expense Tracking API

Headless expense management with policy enforcement and approval workflows, backed by an MCP server. Submit, approve, reimburse — and let an LLM flag policy violations and triage the queue.

Replaces: Expensify, Ramp expenses, Brex expenses.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/expense-tracking
cd starter-kits/expense-tracking
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
| GET | `/expenses` | List expenses |
| POST | `/expenses` | Create a draft expense |
| GET | `/expenses/{id}` | Get an expense |
| PATCH | `/expenses/{id}/submit` | Submit for approval |
| PATCH | `/expenses/{id}/approve` | Approve |
| PATCH | `/expenses/{id}/reject` | Reject |
| GET | `/expense-categories` | List categories |
| GET | `/expense-policies` | List policies |
| POST | `/flag-policy-violations` | Orchestrator: flag policy-violating expenses |
| POST | `/summarize-pending-approvals` | Orchestrator: pending approvals by employee |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_expenses` | yes | List expenses |
| `get_expense` | yes | Get expense by id |
| `create_expense` | no | Create a draft expense |
| `submit_expense` | no (idempotent) | Submit for approval |
| `approve_expense` | no (idempotent) | Approve |
| `reject_expense` | no (idempotent) | Reject |
| `list_categories` | yes | List categories |
| `list_policies` | yes | List policies |
| `flag_policy_violations` | yes | Find expenses that exceed a cap or lack a required receipt |
| `summarize_pending_approvals` | yes | Pending expenses grouped by employee |

## The AI angle

`flag_policy_violations` is the differentiator. Instead of teaching an agent to fan out across `/expenses`, `/expense-categories`, and `/expense-policies` and rebuild the rules engine in TypeScript, the gateway runs the join and returns expenses with human-readable reasons. The LLM grounds on small, structured payloads and can act (`reject_expense`) immediately.

## Extending

- **Approver routing**: add a `Approver` entity and an orchestrator that picks the right approver per expense.
- **Receipt OCR**: add a `parse_receipt` MCP tool that takes a URL and pre-fills `merchant`, `amount`, `date`.
- **GL export**: add a `export_to_gl` orchestrator that bundles approved expenses by `glCode` and emits a CSV for the accounting system.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.

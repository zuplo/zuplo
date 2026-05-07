# Expense Tracking Starter Kit

Headless expense management with policy enforcement. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Routes

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

## Entities

- `Expense` — primary
- `ExpenseCategory` — chart-of-accounts catalog (glCode, requiresReceipt, maxAmountCents)
- `ExpensePolicy` — daily/per-diem caps, receipt threshold
- `Reimbursement` — bundle of approved expenses paid back to an employee

## MCP tools registered

`list_expenses`, `get_expense`, `create_expense`, `submit_expense`, `approve_expense`, `reject_expense`, `list_categories`, `list_policies`, `flag_policy_violations`, `summarize_pending_approvals`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

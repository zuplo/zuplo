# PTO & Leave Management Kit

A Zuplo Starter Kit for PTO and leave-of-absence tracking. Replaces BambooHR Time Off, Vacation Tracker, and AbsenceSoft.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Routes + MCP annotations (Layer 1) + `/mcp` operations array (Layer 2) |
| `config/policies.json` | api-key-inbound, rate-limit, prompt-injection-outbound, secret-masking-outbound |
| `modules/repositories/leave-requests.ts` | LeaveRequest entity + repository factory keyed by `DB_PROVIDER` |
| `modules/repositories/leave-balances.ts` | LeaveBalance snapshot repository |
| `modules/handlers/*.ts` | One file per CRUD endpoint |
| `modules/mcp-tools/find-overlapping-pto.ts` | Orchestrator MCP tool — finds team PTO conflicts |
| `modules/mcp-tools/check-leave-balance.ts` | Orchestrator MCP tool — returns employee balance snapshot |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leave-requests` | List leave requests (filter by employeeId, status, date) |
| POST | `/leave-requests` | Create leave request (status=pending) |
| GET | `/leave-requests/{id}` | Get a single leave request |
| PATCH | `/leave-requests/{id}/approve` | Approve a leave request |
| PATCH | `/leave-requests/{id}/deny` | Deny a leave request |
| DELETE | `/leave-requests/{id}` | Cancel via status=cancelled (soft delete) |
| POST | `/find-overlapping-pto` | Orchestrator: PTO conflicts in a window |
| POST | `/check-leave-balance` | Orchestrator: employee balance snapshot |
| POST | `/mcp` | MCP server endpoint |

## Orchestrator rationale

`find_overlapping_pto` is the kit's headline AI tool. Managers and TPMs constantly ask "who's out the week of X?" — the orchestrator iterates every team member's leave requests through the public `list_leave_requests` route (which keeps tenant + auth scoping intact via `context.invokeRoute`) and returns a flat list of overlap conflicts, ready for the LLM to summarise.

`check_leave_balance` answers the second-most-common assistant question — "does Maria have enough vacation left for this trip?" — by reading the snapshot `LeaveBalance` table. A production fork would replace the snapshot read with an accrual computation; the tool's contract stays the same.

## Verifying the kit boots

```bash
cp env.example .env
npm install
npm run dev
# In another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

The Inspector should show 8 tools: `list_leave_requests`, `get_leave_request`, `create_leave_request`, `approve_leave_request`, `deny_leave_request`, `cancel_leave_request`, `find_overlapping_pto`, `check_leave_balance`.

# PTO & Leave Management API

A Zuplo Starter Kit that ships a fully-tenanted PTO and leave-of-absence API together with an MCP server — agents can list, approve, deny, and analyse leave requests through plain HTTP or through MCP tools.

Replaces: BambooHR Time Off, Vacation Tracker, AbsenceSoft.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/pto-leave-management  # already done if you cloned the kit
cd starter-kits/pto-leave-management
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
| `neon` | Supported |
| `upstash-redis` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example).

The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke-test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leave-requests` | List leave requests (filter by employeeId, status, date window) |
| POST | `/leave-requests` | Create a leave request (status=pending) |
| GET | `/leave-requests/{id}` | Get a leave request |
| PATCH | `/leave-requests/{id}/approve` | Approve a leave request |
| PATCH | `/leave-requests/{id}/deny` | Deny a leave request |
| DELETE | `/leave-requests/{id}` | Cancel a leave request (soft-delete via status=cancelled) |
| POST | `/find-overlapping-pto` | Orchestrator: who on this team is out during this window? |
| POST | `/check-leave-balance` | Orchestrator: how many days does this employee have left? |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_leave_requests` | tool | yes | List leave requests in tenant with filters |
| `get_leave_request` | tool | yes | Get a leave request by id |
| `create_leave_request` | tool | no | Create a leave request (pending) |
| `approve_leave_request` | tool | idempotent | Approve a leave request |
| `deny_leave_request` | tool | idempotent | Deny a leave request |
| `cancel_leave_request` | tool | destructive | Cancel a leave request |
| `find_overlapping_pto` | tool | yes | Find conflicts in a date window for a team (orchestrator) |
| `check_leave_balance` | tool | yes | Get an employee's snapshot leave balance (orchestrator) |

## The AI angle

The two orchestrator tools — `find_overlapping_pto` and `check_leave_balance` — are why this kit exists. An assistant that can answer "who's out next week?" and "does Maria have enough vacation left for this trip?" without bouncing the user between four screens turns leave management from paperwork into a conversation. Both tools call sibling routes through `context.invokeRoute()`, so they inherit the same auth and rate-limit policies the public API uses.

## Extending

- **Custom approval rules:** add a domain rule in `modules/domain/` and wire it into `approve-leave-request.ts` (e.g. require manager email + cap concurrent approvals per team).
- **Real accrual engine:** replace `check-leave-balance.ts`'s snapshot read with a computation over an `accrual-policies` repository plus the existing leave-requests table.
- **Notifications:** add an outbound webhook policy on the create/approve/deny routes to push to Slack or email.
- **New endpoint:** create a handler in `modules/handlers/`, add the route in `routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `operations: [...]` array.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

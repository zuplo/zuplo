# PTO & Leave Management API

A Zuplo Starter Kit that runs PTO and leave-of-absence as conversation: managers ask "who's out next week?" and "does Maria have enough vacation for a June trip?" and an MCP-enabled assistant answers, posts a Slack alert when team coverage is at risk, and drafts the reply to send back.

Replaces: BambooHR Time Off, Vacation Tracker, AbsenceSoft.

## Wires up

- **Slack** (Web API or incoming webhook) — posts a coverage-risk alert into a manager channel when overlapping PTO is detected
- **Resend** — transactional email for approval / denial / cancellation notifications
- **Claude** (Anthropic Messages API, optionally routed through Zuplo AI Gateway) — drafts a friendly reply to "what's my balance?" questions in plain English

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Slack       (chat.postMessage / webhook)
                │                  ├── Resend      (email send)
                │                  └── Claude      (drafted manager replies)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

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

See [env.example](./env.example). Beyond `DB_PROVIDER`, you'll need credentials for the integrations above:

- `SLACK_BOT_TOKEN` + `SLACK_DEFAULT_CHANNEL` (or `SLACK_WEBHOOK_URL`) — coverage-risk alerts
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — outbound email
- `ANTHROPIC_API_KEY` — drafted replies (`AI_GATEWAY_URL` optional, routes through Zuplo's AI Gateway for caching + budgets)

The kit will boot with `DB_PROVIDER=in-memory` and no integration creds — orchestrators that need them simply return `{ sent: false, error }` rather than crash.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leave-requests` | List leave requests (filter by employeeId, status, date window) |
| POST | `/leave-requests` | Create a leave request (status=pending) |
| GET | `/leave-requests/{id}` | Get a leave request |
| PATCH | `/leave-requests/{id}/approve` | Approve a leave request |
| PATCH | `/leave-requests/{id}/deny` | Deny a leave request |
| DELETE | `/leave-requests/{id}` | Cancel a leave request (soft-delete via status=cancelled) |
| POST | `/find-overlapping-pto` | Orchestrator: who on this team is out during this window? Optional Slack alert. |
| POST | `/check-leave-balance` | Orchestrator: how many days does this employee have left? Optional Claude-drafted reply. |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Calls | Description |
|---|---|---|---|---|
| `list_leave_requests` | tool | yes | DB | List leave requests in tenant with filters |
| `get_leave_request` | tool | yes | DB | Get a leave request by id |
| `create_leave_request` | tool | no | DB | Create a leave request (pending) |
| `approve_leave_request` | tool | idempotent | DB | Approve a leave request |
| `deny_leave_request` | tool | idempotent | DB | Deny a leave request |
| `cancel_leave_request` | tool | destructive | DB | Cancel a leave request |
| `find_overlapping_pto` | tool | yes | DB + Slack (optional) | Find conflicts in a date window for a team and (optionally) post a Slack coverage alert |
| `check_leave_balance` | tool | yes | DB + Claude (optional) | Get an employee's snapshot leave balance and (optionally) get a drafted reply |

## The AI angle

`find_overlapping_pto` and `check_leave_balance` are why this kit exists. Pass `notifyManager: true` and the first tool walks every team member's leave window, finds the conflicts, and posts a `:warning: Coverage risk for the Platform team` message to the manager's Slack channel — all in one call. Pass `draftReply: true` and the second tool reads the snapshot balance and asks Claude (Sonnet 4.7 by default) to write a 2-3 sentence reply the manager can paste straight into Slack. Both orchestrators inherit the kit's auth, rate-limit, and tenant scoping because they call sibling routes through `context.invokeRoute()`.

## Extending

- **Swap Slack for Microsoft Teams:** replace `modules/integrations/slack.ts` with a Teams Incoming Webhook caller — same shape, different URL.
- **Swap Resend for Postmark/SES:** replace `modules/integrations/resend.ts`. The `find_overlapping_pto` and approve/deny handlers stay identical.
- **Real accrual engine:** replace `check-leave-balance.ts`'s snapshot read with a computation over an `accrual-policies` repository plus the existing leave-requests table.
- **Email on approve/deny:** wire `sendResendEmail()` into `approve-leave-request.ts` and `deny-leave-request.ts` to confirm decisions to the requester.
- **Route Claude through Zuplo's AI Gateway:** set `AI_GATEWAY_URL` and every Claude call inherits caching, budgets, and prompt-injection scanning.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

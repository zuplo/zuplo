# Performance Review & 360 API

A Zuplo Starter Kit that runs review cycles like a real product: a single MCP call invites peer reviewers via Resend with a templated email, and another single MCP call asks Claude to read every submitted narrative and cluster it into named themes — the calibration write-up the manager actually delivers.

Replaces: Lattice, 15Five, Culture Amp.

## Wires up

- **Resend** — sends per-reviewer feedback request emails with a templated subject + body
- **Claude** (Anthropic Messages API, optionally routed through Zuplo AI Gateway) — clusters peer/manager/self narratives into 3-6 themes with verbatim evidence quotes and a recommended manager action per theme

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Resend  (per-reviewer feedback request emails)
                │                  └── Claude  (theme clustering for calibration)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/performance-review
cp env.example .env
npm install
npm run dev
# Gateway boots at http://localhost:9000
```

To explore the MCP server:

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

## Choosing a database

This kit ships with HTTP-only adapters (Zuplo's edge runtime — no TCP drivers). Set `DB_PROVIDER` in `.env` to one of:

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-memory (tests/local) — default |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — required if `request_peer_feedback` should actually send invites
- `ANTHROPIC_API_KEY` — required for theme clustering (`AI_GATEWAY_URL` optional)

The kit boots fine with just `DB_PROVIDER=in-memory`. `request_peer_feedback` will still create draft Reviews without sending if Resend isn't configured (pass `sendInvites: false`), and `summarize_feedback_themes` returns the aggregate stats without the themed write-up if Claude isn't configured.

## API surface

| Method | Path | Operation ID | Description |
|---|---|---|---|
| POST | `/cycle` | `create_cycle` | Create review cycle |
| GET | `/cycles` | `list_cycles` | List cycles |
| POST | `/goal` | `create_goal` | Create goal |
| PATCH | `/goal-progress/{id}` | `update_goal_progress` | Update goal progress |
| GET | `/goals` | `list_goals` | List goals |
| POST | `/review` | `create_review` | Create review |
| GET | `/review/{id}` | `get_review` | Get review |
| POST | `/review/{id}/submit` | `submit_review` | Submit review |
| GET | `/reviews` | `list_reviews` | List reviews |
| POST | `/request-peer-feedback` | `request_peer_feedback` | Orchestrator: create draft peer reviews + email reviewers via Resend |
| POST | `/summarize-feedback-themes` | `summarize_feedback_themes` | Orchestrator: aggregate ratings + Claude theme clustering |
| POST | `/track-goal-progress` | `track_goal_progress` | Orchestrator: goal progress rollup |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Calls | Description |
|---|---|---|---|---|
| `create_cycle` | tool | no | DB | Create a review cycle |
| `list_cycles` | tool | yes | DB | List cycles |
| `create_goal` | tool | no | DB | Create a goal |
| `update_goal_progress` | tool | idempotent | DB | Update goal progress |
| `list_goals` | tool | yes | DB | List goals |
| `create_review` | tool | no | DB | Create a review |
| `get_review` | tool | yes | DB | Get a review |
| `submit_review` | tool | idempotent | DB | Submit (move from draft to submitted) |
| `list_reviews` | tool | yes | DB | List reviews |
| `request_peer_feedback` | tool | no | DB + Resend | Create draft peer reviews and email each reviewer (orchestrator) |
| `summarize_feedback_themes` | tool | yes | DB + Claude | Aggregate ratings + Claude theme clustering (orchestrator) |
| `track_goal_progress` | tool | yes | DB | Goal progress rollup (orchestrator) |

Both MCP wiring layers agree: each operation has `mcp: { type: "tool" }` and the `/mcp` route's `options.operations: [...]` lists every `operationId` exposed.

## The AI angle

Two orchestrators carry this kit:

- **`request_peer_feedback`** turns the most-skipped step in a review cycle (sending the actual reviewer invites) into one MCP call. Pass `revieweeEmail`, `peerEmails`, `cycleId`, and `sendInvites: true` and it creates one draft Review per peer in the DB *and* fires a templated Resend email to each reviewer with `{{name}}`, `{{revieweeName}}`, `{{deadline}}`, and `{{reviewLink}}` filled in. Override `messageBody` / `messageSubject` to use your own template.
- **`summarize_feedback_themes`** is the calibration tool. Pass `clusterThemes: true` and it pulls every submitted Review for the (reviewee, cycle) pair and asks Claude (Sonnet 4.7) to cluster the narratives into 3-6 named themes with verbatim quotes, evidence counts, and a one-line manager action per theme — the document the manager pastes into their delivery prep.

## Extending

- **Swap Resend for Postmark / SES:** replace `modules/integrations/resend.ts`. The orchestrator code stays identical.
- **Slack reminders:** add a `notify_outstanding_reviewers` orchestrator that lists Reviews with status=draft past the deadline and DMs each reviewer in Slack.
- **Calibration meeting prep:** chain `summarize_feedback_themes` for every reviewee on a manager's team into a single brief.
- **Route Claude through Zuplo's AI Gateway:** set `AI_GATEWAY_URL` and every Claude call inherits caching, budgets, and prompt-injection scanning.
- **New endpoint:** add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

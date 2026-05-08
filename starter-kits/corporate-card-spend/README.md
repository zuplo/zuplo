# Corporate Card / Spend Controls API

Headless spend controls that pull transactions from Ramp, push memo-chases to cardholders in Slack, and right-size limits — all behind an MCP surface that an agent can drive at month-end close.

Replaces: in-house spend dashboards, light Brex/Airbase deployments.

## Wires up

**Ramp** is the issuer — `sync_ramp_transactions` pulls cleared transactions, `set_spend_limit` mirrors limit changes back to Ramp via the Developer API. **Slack** is where employees live — `find_uncoded_transactions` with `notifySlack=true` looks up each cardholder by email and DMs them a friendly chase listing every uncoded txn so they can reply with memos in-line.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Ramp (transactions sync, card limit push)
                │                  └── Slack (chat.postMessage, users.lookupByEmail)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/corporate-card-spend
cd starter-kits/corporate-card-spend
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

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `RAMP_CLIENT_ID`, `RAMP_CLIENT_SECRET` — Ramp Developer API (OAuth client credentials)
- `SLACK_BOT_TOKEN` — DM cardholders for memos

Both are opt-in. Without them the kit runs as local-only CRUD.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/transactions` | List transactions |
| GET | `/transactions/{id}` | Get a transaction |
| PATCH | `/transactions/{id}/code` | Code a transaction (category + GL) |
| PATCH | `/transactions/{id}/memo` | Add or update memo |
| GET | `/cards` | List cards |
| POST | `/cards/{id}/freeze` | Freeze a card |
| POST | `/cards/{id}/unfreeze` | Unfreeze a card |
| PUT | `/cards/{id}/spend-limit` | Set card spend limit (mirrors to Ramp) |
| POST | `/sync-ramp-transactions` | Orchestrator: pull Ramp txns into local store |
| POST | `/find-uncoded-transactions` | Orchestrator: uncoded posted txns + Slack DM chase |
| POST | `/recommend-limit-change` | Orchestrator: limit recommendation |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_transactions` | yes | — | List card transactions |
| `get_transaction` | yes | — | Get a transaction |
| `code_transaction` | no | — | Assign category + GL code |
| `add_memo` | no | — | Attach business-purpose memo |
| `list_cards` | yes | — | List corporate cards |
| `freeze_card` | destructive | — | Block new charges |
| `unfreeze_card` | no | — | Re-enable a frozen card |
| `set_spend_limit` | no (idempotent) | Ramp (when `rampCardId` is set) | Update limit, optionally push to Ramp |
| `sync_ramp_transactions` | no | Ramp | Pull Ramp txns, upsert local |
| `find_uncoded_transactions` | yes | Slack (when `notifySlack=true`) | Uncoded txns; DM cardholders for memos |
| `recommend_limit_change` | yes | — | 90-day usage-based limit recommendation |

## The AI angle

Month-end close: agent runs `sync_ramp_transactions` to pull anything new from Ramp, then `find_uncoded_transactions` with `notifySlack=true`. The gateway resolves each cardholder's Slack id by email and DMs them a single message listing every uncoded transaction. They reply with memos; the agent calls `add_memo` + `code_transaction` to close the loop. At limit-review time, `recommend_limit_change` walks 90 days of behavior and the agent calls `set_spend_limit` with `rampCardId` to mirror the change to Ramp.

## Extending

- **Swap issuer:** replace `modules/integrations/ramp.ts` with Brex or Stripe Issuing — only `sync_ramp_transactions` and `set_spend_limit` consume it.
- **Receipt OCR:** add a `parse_receipt` orchestrator like the expense-tracking kit.
- **Add cardholder controls:** push merchant-category allowlist/blocklist to Ramp via `spending_restrictions.categories`.
- **Interactive Slack memos:** add `/webhooks/slack/interactions` to accept memo replies and call `add_memo` + `code_transaction` automatically.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

# Corporate Card / Spend Controls API

Headless API for issuing corporate cards, ingesting transactions, coding spend, and managing per-card limits. Designed to be embedded inside your back-office app or controlled by an LLM agent at month-end close.

Replaces: Ramp, Brex, Airbase.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/my-kit  # already done if you forked this kit
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

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`.

## Environment variables

See [env.example](./env.example).

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
| PUT | `/cards/{id}/spend-limit` | Set card spend limit |
| POST | `/find-uncoded-transactions` | Orchestrator: uncoded posted transactions |
| POST | `/recommend-limit-change` | Orchestrator: limit recommendation |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_transactions` | yes | List card transactions |
| `get_transaction` | yes | Get a transaction by id |
| `code_transaction` | no | Assign category + GL code |
| `add_memo` | no | Attach business-purpose memo |
| `list_cards` | yes | List corporate cards |
| `freeze_card` | destructive | Block new charges on the card |
| `unfreeze_card` | no | Re-enable a frozen card |
| `set_spend_limit` | no | Update recurring spend limit |
| `find_uncoded_transactions` | yes | Orchestrator — uncoded transactions to chase |
| `recommend_limit_change` | yes | Orchestrator — limit sizing recommendation |

## The AI angle

Month-end close is an LLM-shaped problem. `find_uncoded_transactions` lets an agent walk uncoded posted spend by employee and nudge for memos. `recommend_limit_change` lets the same agent right-size limits using 90 days of behavior, surfacing both over- and under-utilized cards rather than letting them rot at whatever a human last typed.

## Extending

- **Add cardholder controls:** add merchant-category allowlists/blocklists per card.
- **Add receipt capture:** attach a `receiptUrl` to `Transaction` and a webhook to ingest from email.
- **Add accounting export:** an orchestrator that batches `coded` transactions into a NetSuite/QBO journal.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

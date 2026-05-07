# Customer Health API Starter Kit

A Zuplo Starter Kit for customer health scoring, signal capture, and playbook execution. Replaces Gainsight, ChurnZero, and Catalyst.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/my-kit
cd starter-kits/customer-health
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

See [env.example](./env.example).

The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts` | List accounts (filter by `csmEmail`) |
| GET | `/accounts/{id}` | Get account |
| GET | `/health-scores` | List health scores (filter by `accountId`, `tier`) |
| GET | `/health-scores/{id}` | Get health score |
| POST | `/recalculate-health` | Compute and append a new score |
| GET | `/signals` | List signals (filter by `accountId`, `severity`) |
| POST | `/signals` | Record a signal |
| GET | `/playbooks` | List playbooks |
| POST | `/playbooks` | Create a playbook |
| GET | `/playbook-runs` | List runs (filter by `accountId`, `status`) |
| POST | `/playbook-runs` | Start a run |
| PATCH | `/playbook-runs/{id}/complete-step` | Advance run by one step |
| POST | `/summarize-account-health` | Orchestrator: account health briefing |
| POST | `/recommend-playbook` | Orchestrator: signal-based playbook recommendation |
| POST | `/predict-churn-risk` | Orchestrator: churn-risk report |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_accounts` | tool | yes | List accounts in tenant |
| `get_account` | tool | yes | Get one account |
| `list_health_scores` | tool | yes | List computed scores |
| `get_health_score` | tool | yes | Get one score with drivers |
| `recalculate_health` | tool | no | Append a new score |
| `list_signals` | tool | yes | List leading-indicator signals |
| `record_signal` | tool | no | Record a new signal |
| `list_playbooks` | tool | yes | Browse the playbook catalog |
| `create_playbook` | tool | no | Create a playbook |
| `list_playbook_runs` | tool | yes | List runs for an account |
| `run_playbook` | tool | no | Start a playbook on an account |
| `complete_playbook_step` | tool | no | Advance a run |
| `summarize_account_health` | tool | yes | Briefing orchestrator |
| `recommend_playbook` | tool | yes | Match active signals to playbooks |
| `predict_churn_risk` | tool | yes | Renewal-window risk report |

## The AI angle

CSMs juggle dozens of accounts. `summarize_account_health` lets an assistant produce a one-paragraph briefing on any account in a single tool call — combining latest score, severity-ranked open signals, active playbooks, and days-to-renewal. `recommend_playbook` closes the loop: it matches the active signals against the catalog and surfaces the next best play. `predict_churn_risk` is the team-level rollup — "which accounts in my book are most likely to churn this quarter?" — answered without writing SQL.

## Extending

- **New signal kind:** extend the `Signal.kind` enum in both `modules/repositories/signals.ts` and `config/routes.oas.json`.
- **New orchestrator:** add a handler in `modules/mcp-tools/`, list it on a route in `routes.oas.json`, and add the `operationId` to the `/mcp` route's `operations` array.
- **Replace the score formula:** edit `modules/handlers/recalculate-health.ts`. The persistence shape and tier mapping stay the same.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

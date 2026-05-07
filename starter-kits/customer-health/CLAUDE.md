# Customer Health API Kit

A Zuplo Starter Kit for customer-success teams. Replaces Gainsight, ChurnZero, and Catalyst.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Account` | The unit of CSM ownership and renewal. |
| `HealthScore` | A computed 0..100 score for an account at a point in time, with driver breakdown and tier. Append-only. |
| `Signal` | A leading-indicator event — usage drop, ticket spike, NPS dip, etc. |
| `Playbook` | A reusable response sequence keyed by signal trigger. |
| `PlaybookRun` | An in-flight playbook execution against an account. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts` | List accounts (filter by `csmEmail`) |
| GET | `/accounts/{id}` | Get account |
| GET | `/health-scores` | List scores (filter by `accountId`, `tier`) |
| GET | `/health-scores/{id}` | Get score |
| POST | `/recalculate-health` | Append a new computed score |
| GET | `/signals` | List signals (filter by `accountId`, `severity`) |
| POST | `/signals` | Record a signal |
| GET | `/playbooks` | List playbooks |
| POST | `/playbooks` | Create a playbook |
| GET | `/playbook-runs` | List runs (filter by `accountId`, `status`) |
| POST | `/playbook-runs` | Start a run |
| PATCH | `/playbook-runs/{id}/complete-step` | Advance a run by one step |
| POST | `/summarize-account-health` | Orchestrator |
| POST | `/recommend-playbook` | Orchestrator |
| POST | `/predict-churn-risk` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `summarize_account_health` — single-account briefing combining latest score, severity-ranked open signals, active playbook runs, days-to-renewal. Calls `get_account`, `list_health_scores`, `list_signals`, `list_playbook_runs`.
- `recommend_playbook` — finds playbooks whose `trigger.signalKind` + `minSeverity` matches active signals on an account and isn't already running. Calls `list_signals`, `list_playbooks`, `list_playbook_runs`.
- `predict_churn_risk` — surfaces accounts in red tier or renewing in `daysAhead` with high-severity signals. Optionally scoped to a CSM. Calls `list_accounts`, `list_health_scores`, `list_signals` per account.

Both MCP layers must agree — every orchestrator's `operationId` appears both as `mcp` annotation on its route and in the `/mcp` route's `operations` array.

## Verifying the kit boots

```bash
cp env.example .env
npm install
npm run dev
# In another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

The Inspector should show 15 tools: 12 CRUD + 3 orchestrators.

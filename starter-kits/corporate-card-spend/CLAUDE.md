# Corporate Card / Spend Controls Starter Kit

Headless API for corporate-card spend management. Replaces Ramp/Brex/Airbase. See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Transaction` | A card transaction posted by the issuer network. |
| `Card` | A corporate card issued to an employee. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/transactions` | List transactions |
| GET | `/transactions/{id}` | Get transaction |
| PATCH | `/transactions/{id}/code` | Assign category + GL code |
| PATCH | `/transactions/{id}/memo` | Add memo |
| GET | `/cards` | List cards |
| POST | `/cards/{id}/freeze` | Freeze card (destructive) |
| POST | `/cards/{id}/unfreeze` | Unfreeze card |
| PUT | `/cards/{id}/spend-limit` | Set spend limit |
| POST | `/find-uncoded-transactions` | Orchestrator |
| POST | `/recommend-limit-change` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `find_uncoded_transactions` — list posted transactions where `coded === false`, optionally filtered by `employeeEmail` and `daysBack`. Calls `list_cards` (when filtering) and `list_transactions`.
- `recommend_limit_change` — read 90 days of posted spend on a card vs. the current limit and recommend `increase` / `decrease` / `keep`. Calls `get_card` plus `list_transactions`.

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.

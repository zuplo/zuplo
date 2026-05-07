# SaaS Management Starter Kit

Headless SaaS subscription, license, seat, and usage management API. Replaces Zylo, Productiv, Torii. See [../CLAUDE.md](../CLAUDE.md) for conventions.

## Domain

| Entity | Purpose |
|---|---|
| `SaaSApp` | Primary entity. A SaaS subscription record. |
| `License` | Per-employee assignment of an app. |
| `Seat` | Capacity unit on an app. |
| `Usage` | Per-period activity per employee. |
| `Renewal` | Planned action at the upcoming renewal. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/apps` | List apps |
| POST | `/apps` | Register app |
| GET | `/apps/{id}` | Get app |
| PATCH | `/apps/{id}` | Update app |
| GET | `/licenses` | List licenses (filter by app or employee) |
| POST | `/licenses` | Assign |
| POST | `/licenses/{id}/revoke` | Revoke (destructive) |
| GET | `/usage` | List usage |
| POST | `/usage` | Record usage |
| GET | `/renewals` | List renewals |
| POST | `/renewals` | Plan renewal |
| POST | `/find-unused-licenses` | Orchestrator |
| POST | `/recommend-seat-reduction` | Orchestrator |
| POST | `/forecast-renewal-cost` | Orchestrator |
| POST | `/mcp` | MCP endpoint |

## Orchestrators

- `find_unused_licenses` - active licenses whose lastActiveAt is older than `daysWithoutActivity` (or never active and assigned long ago).
- `recommend_seat_reduction` - active licenses for an app vs total seats; recommends new seat count + savings.
- `forecast_renewal_cost` - sum of annualCostCents across apps with renewalDate in the next `monthsAhead` months.

## MCP tools registered

`list_apps`, `get_app`, `register_app`, `update_app`, `list_licenses`, `assign_license`, `revoke_license`, `list_usage`, `record_usage_window`, `list_renewals`, `plan_renewal`, `find_unused_licenses`, `recommend_seat_reduction`, `forecast_renewal_cost`. Same operationIds in both layers.

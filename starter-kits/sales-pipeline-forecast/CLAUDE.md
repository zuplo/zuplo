# Sales Pipeline / Forecast API

Deals, forecasts, snapshots, and quotas with MCP tools that roll up forecasts, flag at-risk deals, and compare week over week.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/compare-week-over-week` | `compare_week_over_week` | tool |
| PATCH | `/deal-forecast-category/{id}` | `update_deal_forecast_category` | tool |
| GET | `/deal/{id}` | `get_deal` | tool |
| GET | `/deals` | `list_deals` | tool |
| POST | `/flag-at-risk-deals` | `flag_at_risk_deals` | tool |
| GET | `/forecast/{id}` | `get_forecast` | tool |
| POST | `/forecast/{id}/submit` | `submit_forecast` | tool |
| GET | `/forecasts` | `list_forecasts` | tool |
| GET | `/pipeline-snapshots` | `list_pipeline_snapshots` | tool |
| PATCH | `/quota/{id}` | `set_quota` | tool |
| GET | `/quotas` | `list_quotas` | tool |
| POST | `/roll-up-forecast` | `roll_up_forecast` | tool |
| POST | `/take-snapshot` | `take_snapshot` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

13 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `get_deal`
- `get_forecast`
- `list_deals`
- `list_forecasts`
- `list_pipeline_snapshots`
- `list_quotas`
- `set_quota`
- `submit_forecast`
- `take_snapshot`
- `update_deal_forecast_category`
- `compare_week_over_week`
- `flag_at_risk_deals`
- `roll_up_forecast`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 13 entries above.

## Replaces

- Clari
- BoostUp
- Salesforce forecasting

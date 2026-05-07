# Commission / Sales Comp API

Comp plans, quotas, credits, and payouts with MCP tools that explain commission amounts, model what-ifs, and flag clawback risk.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/credit` | `record_credit` | tool |
| GET | `/credits` | `list_credits` | tool |
| POST | `/explain-commission-amount` | `explain_commission_amount` | tool |
| POST | `/flag-clawback-risk` | `flag_clawback_risk` | tool |
| POST | `/model-what-if-close` | `model_what_if_close` | tool |
| GET | `/payout/{id}` | `get_payout` | tool |
| POST | `/payout/{id}/approve` | `approve_payout` | tool |
| GET | `/payouts` | `list_payouts` | tool |
| POST | `/payouts/calculate` | `calculate_payouts` | tool |
| POST | `/plan` | `create_plan` | tool |
| GET | `/plans` | `list_plans` | tool |
| PATCH | `/quota/{id}` | `set_quota` | tool |
| GET | `/quotas` | `list_quotas` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

13 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `approve_payout`
- `calculate_payouts`
- `create_plan`
- `get_payout`
- `list_credits`
- `list_payouts`
- `list_plans`
- `list_quotas`
- `record_credit`
- `set_quota`
- `explain_commission_amount`
- `flag_clawback_risk`
- `model_what_if_close`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 13 entries above.

## Replaces

- CaptivateIQ
- Spiff
- Xactly

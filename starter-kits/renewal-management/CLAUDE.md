# Renewal Management API Kit

A Zuplo Starter Kit for renewal forecasting, risk tracking, and negotiation logging. Replaces Gainsight Renewals and Salesforce Renewal Cloud.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `RenewalOpportunity` | The unit of forecasting — one per contract, with status, risk tier, and forecast category. |
| `Contract` | The signed agreement behind the renewal. |
| `RiskFactor` | A specific risk on a renewal — with severity and addressed timestamp. |
| `Negotiation` | A back-and-forth proposal during the renewal cycle. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/renewals` | List renewals (filter by status, ownerEmail, riskTier) |
| POST | `/renewals` | Create a renewal |
| GET | `/renewals/{id}` | Get renewal |
| PATCH | `/renewals/{id}` | Update status / forecast / proposed ARR |
| GET | `/contracts` | List contracts (filter by accountId) |
| GET | `/contracts/{id}` | Get contract |
| GET | `/risk-factors` | List risks (filter by renewalId, open) |
| POST | `/risk-factors` | Add a risk factor |
| GET | `/negotiations` | List negotiations |
| POST | `/negotiations` | Log a negotiation |
| POST | `/prep-renewal-briefing` | Orchestrator |
| POST | `/calculate-uplift-proposal` | Orchestrator |
| POST | `/flag-at-risk-renewals` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `prep_renewal_briefing` — full call-prep output. Calls `get_renewal`, `get_contract`, `list_risk_factors`, `list_negotiations`.
- `calculate_uplift_proposal` — open high-severity risks zero out the uplift; medium caps it at 3%. Calls `get_renewal`, `list_risk_factors`.
- `flag_at_risk_renewals` — combines `riskTier === 'high'` with open high-severity risks across a window. Calls `list_renewals`, `list_risk_factors` per renewal.

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

The Inspector should show 13 tools: 10 CRUD + 3 orchestrators.

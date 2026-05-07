# Renewal Management API Starter Kit

A Zuplo Starter Kit for renewal forecasting, risk tracking, and negotiation logging. Replaces Gainsight Renewals and Salesforce Renewal Cloud.

## Quickstart

```bash
cd starter-kits/renewal-management
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
| GET | `/renewals` | List renewals (filter by status, ownerEmail, riskTier) |
| POST | `/renewals` | Create a renewal |
| GET | `/renewals/{id}` | Get renewal |
| PATCH | `/renewals/{id}` | Update status / forecast / proposed ARR |
| GET | `/contracts` | List contracts (filter by accountId) |
| GET | `/contracts/{id}` | Get contract |
| GET | `/risk-factors` | List risks (filter by renewalId, open) |
| POST | `/risk-factors` | Add a risk factor |
| GET | `/negotiations` | List negotiations (filter by renewalId, status) |
| POST | `/negotiations` | Log a negotiation |
| POST | `/prep-renewal-briefing` | Orchestrator: full briefing for a call |
| POST | `/calculate-uplift-proposal` | Orchestrator: recommended uplift / ARR |
| POST | `/flag-at-risk-renewals` | Orchestrator: at-risk renewals in window |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_renewals` | tool | yes | List renewals in tenant |
| `create_renewal` | tool | no | Create a renewal |
| `get_renewal` | tool | yes | Get renewal |
| `update_renewal_status` | tool | no | Move renewal between statuses |
| `list_contracts` | tool | yes | List contracts |
| `get_contract` | tool | yes | Get contract |
| `list_risk_factors` | tool | yes | List risks (open or addressed) |
| `add_risk_factor` | tool | no | Add a risk |
| `list_negotiations` | tool | yes | List negotiations |
| `log_negotiation` | tool | no | Log a negotiation |
| `prep_renewal_briefing` | tool | yes | Briefing orchestrator |
| `calculate_uplift_proposal` | tool | yes | Uplift recommendation |
| `flag_at_risk_renewals` | tool | yes | At-risk window report |

## The AI angle

Renewals don't fail at the call — they fail in the weeks leading up to it, where AEs are scrambling to remember "what's the latest on this account?" `prep_renewal_briefing` produces the structured briefing in one tool call. `calculate_uplift_proposal` keeps pricing pragmatic — high-severity open risks zero out the uplift automatically, so the LLM can't propose a 10% bump on a flaming account. `flag_at_risk_renewals` is the manager's weekly review — "where do I need to step in this week?"

## Extending

- **New risk factor type:** there are no enums on `factor` — it's free-form. Add domain conventions in your `add_risk_factor` callers.
- **New orchestrator:** add a handler in `modules/mcp-tools/`, a route in `routes.oas.json`, and an entry in the `/mcp` operations array.
- **Extend uplift logic:** edit `modules/mcp-tools/calculate-uplift-proposal.ts`. The handler is a single file with no I/O outside `invokeJson`.
- **Switch databases:** change `DB_PROVIDER` in `.env`.

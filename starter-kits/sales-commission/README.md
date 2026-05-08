# Commission / Sales Comp API

Comp plans, quotas, credits, and payouts — with the part that actually makes reps happy: a tool that explains where their commission number came from, in plain English.

Replaces: CaptivateIQ, Spiff, Xactly.

## Wires up

**Slack** delivers the "your commission for Q2 is approved" DM the moment ops hits approve. **Claude** reads the comp plan, the credits, the accelerator math, and writes the rep an honest paragraph explaining the number — including whether the recomputation matches the stored value.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── Slack    (approve_payout DM)
                │                  └── Claude   (explain_commission_amount)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
cd starter-kits/sales-commission
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

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `SLACK_BOT_TOKEN` (+ `SLACK_DEFAULT_CHANNEL`) or `SLACK_WEBHOOK_URL` — for approve_payout DMs
- `ANTHROPIC_API_KEY` (or `AI_GATEWAY_URL`) — for the commission explanation

The kit boots without any of these — Slack and Claude calls are skipped if their env isn't configured, and the explanation field is just omitted from the response.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| POST | `/credit` | Record credit |
| GET | `/credits` | List credits |
| POST | `/payout/{id}/approve` | Approve payout (+ Slack DM) |
| GET | `/payout/{id}` | Get payout |
| GET | `/payouts` | List payouts |
| POST | `/payouts/calculate` | Calculate payouts for a period |
| POST | `/plan` | Create comp plan |
| GET | `/plans` | List comp plans |
| PATCH | `/quota/{id}` | Set quota |
| GET | `/quotas` | List quotas |
| POST | `/explain-commission-amount` | Orchestrator: math + Claude explanation |
| POST | `/flag-clawback-risk` | Orchestrator: clawback scan |
| POST | `/model-what-if-close` | Orchestrator: forecast |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `record_credit` / `list_credits` | mixed | DB | Sales credits |
| `create_plan` / `list_plans` | mixed | DB | Comp plans |
| `set_quota` / `list_quotas` | mixed | DB | Quotas |
| `calculate_payouts` | no | DB | Compute payouts for a period |
| `get_payout` / `list_payouts` | yes | DB | Payout reads |
| `approve_payout` | no | DB + **Slack** | Approve + DM rep |
| `explain_commission_amount` | yes | DB + **Claude** | Math + plain-English explanation |
| `flag_clawback_risk` | yes | DB | Clawback scan |
| `model_what_if_close` | yes | DB | Forecast helper |

## The AI angle

`explain_commission_amount` is the kit's reason to exist. Comp plans are notoriously spaghetti — base rate × attainment-tier accelerator × split percent × deal-status modifier — and reps end every quarter typing "where did this number come from?" into a Slack ticket queue. This tool walks the credits that fed the payout, resolves the plan that priced it, reproduces the accelerator decision, and feeds the whole structured breakdown to Claude with a "be a comp ops analyst, explain this in 180 words" system prompt. Claude grounds its answer on the math rather than hallucinating, and is honest when the recomputation does not match the stored number — which is the most useful response of all.

`approve_payout` rounds out the loop: when comp ops hits approve, the rep gets DM'd in Slack the same second, with the period and the dollar amount. No "did you check the email yet?" questions.

## Extending

- **Swap Slack for Teams / Discord:** replace `modules/integrations/slack.ts` with a Microsoft Graph / Discord adapter (same shape).
- **Route Claude through a gateway:** set `AI_GATEWAY_URL`. Useful for adding budget caps or prompt-injection scanning in front of the comp explanation.
- **Add audit log:** wrap `payoutRepository.update` with a write to a `commission_events` collection so every approval is traceable.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

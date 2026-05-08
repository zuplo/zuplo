# Customer Health API Starter Kit

Customer health scoring that pulls signals from the systems you already pay for — usage from PostHog, billing health from Stripe, your own product events — and asks Claude to call churn risk for each account.

Replaces: Gainsight, ChurnZero, Catalyst.

## Wires up

**PostHog** is the usage-signal source: predict_churn_risk runs a HogQL query you supply for weekly active users per account, and record_signal mirrors every health event back into PostHog so it lights up the dashboards you already have. **Stripe** (read-only) provides revenue health — past-due invoices, cancelling subscriptions, next renewal date. **Claude** reads the merged per-account context and returns a low / medium / high risk verdict with one sentence of reasoning.

## Architecture at a glance

```
Inbound ──▶ Zuplo Gateway ──▶ Integration handlers
                │                  ├── PostHog  (HogQL query + event capture)
                │                  ├── Stripe   (read-only invoices + subs)
                │                  └── Claude   (per-account risk verdict)
                ▼
          Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
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

See [env.example](./env.example). Each integration is opt-in:

- `POSTHOG_PROJECT_API_KEY` — capture health signals into PostHog
- `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` — pull HogQL usage rollups
- `STRIPE_SECRET_KEY` — read invoices + subscriptions (read-only, restricted key recommended)
- `ANTHROPIC_API_KEY` (or `AI_GATEWAY_URL`) — Claude churn classification

The kit boots and CRUD endpoints work without any of these. predict_churn_risk gracefully skips integrations whose env isn't configured.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts` | List accounts (filter by `csmEmail`) |
| GET | `/accounts/{id}` | Get account |
| GET | `/health-scores` | List health scores |
| GET | `/health-scores/{id}` | Get health score |
| POST | `/recalculate-health` | Compute and append a new score |
| GET | `/signals` | List signals |
| POST | `/signals` | Record a signal (+ mirrors to PostHog) |
| GET | `/playbooks` | List playbooks |
| POST | `/playbooks` | Create a playbook |
| GET | `/playbook-runs` | List runs |
| POST | `/playbook-runs` | Start a run |
| PATCH | `/playbook-runs/{id}/complete-step` | Advance a run |
| POST | `/summarize-account-health` | Orchestrator |
| POST | `/recommend-playbook` | Orchestrator |
| POST | `/predict-churn-risk` | Orchestrator: PostHog + Stripe + Claude |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_accounts` / `get_account` | yes | DB | Account reads |
| `list_health_scores` / `get_health_score` / `recalculate_health` | mixed | DB | Score management |
| `list_signals` | yes | DB | Read signals |
| `record_signal` | no | DB + **PostHog** | Record + mirror to PostHog |
| `list_playbooks` / `create_playbook` | mixed | DB | Playbook catalog |
| `list_playbook_runs` / `run_playbook` / `complete_playbook_step` | mixed | DB | Playbook runs |
| `summarize_account_health` | yes | DB | Account briefing |
| `recommend_playbook` | yes | DB | Signal-to-playbook match |
| `predict_churn_risk` | yes | DB + **PostHog** + **Stripe** + **Claude** | Churn classification |

## The AI angle

`predict_churn_risk` is the kit's reason to exist. CSMs run weekly health reviews by piecing together five tabs: their CRM, the analytics dashboard, the billing portal, the support inbox, the renewal calendar. This orchestrator does it in one tool call.

It pulls accounts (filterable by CSM), then for each account walks: latest health score, high-severity signals, optional Stripe revenue-health (past-due invoices, cancelling subscriptions), optional PostHog usage rollup. Hands the merged structured context to Claude with "you are a CS analyst, classify each as low/medium/high risk, one sentence of reasoning." Claude grounds on the data rather than hallucinating, returns a JSON array, and the orchestrator merges the verdict back into the per-account response.

The same MCP tool runs from Claude Desktop ("which Acme accounts are at risk this quarter?"), an internal cron that posts results to Slack, or your own UI.

## Extending

- **Swap PostHog for Mixpanel / Amplitude:** replace `modules/integrations/posthog.ts` with a Mixpanel adapter. The orchestrator's "weekly active users" signal is just one number per account — the contract is small.
- **Swap Stripe for Recurly / Chargebee:** replace `modules/integrations/stripe.ts`. Keep the `RevenueHealth` shape so the Claude prompt doesn't need to change.
- **Route Claude through a gateway:** set `AI_GATEWAY_URL`. Useful for adding budget caps in front of weekly classification runs.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

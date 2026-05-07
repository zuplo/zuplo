# Headless CRM API

Headless CRM. Models accounts, contacts, deals, activities, and notes — same shape as Salesforce/HubSpot but exposed as a clean REST + MCP API. Designed to be embedded in a custom front-end or driven by an LLM agent.

Replaces: Salesforce, HubSpot CRM, Pipedrive.

## Quickstart

```bash
cd starter-kits/headless-crm
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

## Environment variables

See [env.example](./env.example).

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts` | List accounts |
| POST | `/accounts` | Create account |
| GET | `/accounts/{id}` | Get account |
| GET | `/contacts` | List contacts |
| GET | `/contacts/{id}` | Get contact |
| POST | `/contacts` | Create contact |
| GET | `/deals` | List deals |
| GET | `/deals/{id}` | Get deal |
| POST | `/deals` | Create deal |
| PATCH | `/deals/{id}/stage` | Progress deal stage |
| GET | `/activities` | List activities |
| POST | `/activities` | Log activity |
| POST | `/account-timeline` | Orchestrator: timeline |
| POST | `/find-warm-intro` | Orchestrator: intro paths |
| POST | `/pipeline-summary-by-owner` | Orchestrator: pipeline rollup |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_accounts` / `get_account` / `create_account` | mixed | Accounts |
| `list_contacts` / `get_contact` / `create_contact` | mixed | Contacts |
| `list_deals` / `get_deal` / `create_deal` / `progress_deal_stage` | mixed | Deals |
| `list_activities` / `log_activity` | mixed | Activities |
| `account_timeline` | yes | Orchestrator — merged chronological timeline |
| `find_warm_intro` | yes | Orchestrator — intro paths |
| `pipeline_summary_by_owner` | yes | Orchestrator — pipeline rollup |

## The AI angle

The CRM is the obvious place to plug an LLM in. `account_timeline` is the kind of summary a rep would normally piece together from five tabs — one tool call instead. `find_warm_intro` walks activity history to suggest internal champions for an intro. `pipeline_summary_by_owner` is the foundation of any "where's my pipe?" agent.

## Extending

- **Custom fields:** add a `customFields: Record<string, unknown>` column to any entity.
- **Lead-to-account routing:** add a `Lead` entity and a `route_lead_to_account` orchestrator.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

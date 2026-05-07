# Headless CRM Starter Kit

Headless CRM API. Replaces Salesforce/HubSpot CRM/Pipedrive. See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Account` | A B2B account / company. |
| `Contact` | A person at an account. |
| `Deal` | A sales opportunity. |
| `Activity` | A logged interaction (email/call/meeting/note). |
| `Note` | Free-text note attached to deal/contact/account. |

## Routes

| Method | Path | Tool |
|--------|------|------|
| GET | `/accounts` | `list_accounts` |
| GET | `/accounts/{id}` | `get_account` |
| POST | `/accounts` | `create_account` |
| GET | `/contacts` | `list_contacts` |
| GET | `/contacts/{id}` | `get_contact` |
| POST | `/contacts` | `create_contact` |
| GET | `/deals` | `list_deals` |
| GET | `/deals/{id}` | `get_deal` |
| POST | `/deals` | `create_deal` |
| PATCH | `/deals/{id}/stage` | `progress_deal_stage` |
| GET | `/activities` | `list_activities` |
| POST | `/activities` | `log_activity` |
| POST | `/account-timeline` | Orchestrator |
| POST | `/find-warm-intro` | Orchestrator |
| POST | `/pipeline-summary-by-owner` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `account_timeline` — merged chronological list of activities + notes + deal events for an account.
- `find_warm_intro` — owners with shared activity between target and other accounts.
- `pipeline_summary_by_owner` — rollup of open-deal value by stage per owner.

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.

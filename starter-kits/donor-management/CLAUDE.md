# Donor / Fundraising CRM Starter Kit

Headless donor CRM. Replaces Bloomerang/Blackbaud/DonorPerfect. See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Donor` | Individual or organization that gives. |
| `Donation` | A single gift event. |
| `Campaign` | A fundraising campaign (goal + window). |
| `Pledge` | A multi-installment promise to give. |
| `RecurringGift` | A sustaining gift with an interval. |

## Routes

| Method | Path | Tool |
|--------|------|------|
| GET | `/donors` | `list_donors` |
| POST | `/donors` | `create_donor` |
| GET | `/donors/{id}` | `get_donor` |
| GET | `/donations` | `list_donations` |
| POST | `/donations` | `record_donation` |
| GET | `/campaigns` | `list_campaigns` |
| POST | `/campaigns` | `create_campaign` |
| GET | `/pledges` | `list_pledges` |
| POST | `/pledges` | `create_pledge` |
| GET | `/recurring-gifts` | `list_recurring_gifts` |
| POST | `/identify-lapsed-donors` | Orchestrator |
| POST | `/segment-for-campaign` | Orchestrator |
| POST | `/generate-year-end-receipts` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `identify_lapsed_donors` — donors with no gift in N months above a lifetime threshold.
- `segment_for_campaign` — build a target list filtered by criteria (lifetime giving, prior gift to same campaign).
- `generate_year_end_receipts` — aggregate per-donor totals + per-donation detail for a calendar year.

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.

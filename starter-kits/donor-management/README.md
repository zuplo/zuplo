# Donor / Fundraising CRM API

Headless CRM for non-profits. Tracks donors, donations, campaigns, pledges, and recurring gifts. Designed to be embedded in your fundraising site, donor portal, or controlled by an LLM agent for re-engagement, segmentation, and year-end receipts.

Replaces: Bloomerang, Blackbaud, DonorPerfect.

## Quickstart

```bash
cd starter-kits/donor-management
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
| GET | `/donors` | List donors |
| POST | `/donors` | Create donor |
| GET | `/donors/{id}` | Get donor |
| GET | `/donations` | List donations |
| POST | `/donations` | Record donation |
| GET | `/campaigns` | List campaigns |
| POST | `/campaigns` | Create campaign |
| GET | `/pledges` | List pledges |
| POST | `/pledges` | Create pledge |
| GET | `/recurring-gifts` | List recurring gifts |
| POST | `/identify-lapsed-donors` | Orchestrator: lapsed donors |
| POST | `/segment-for-campaign` | Orchestrator: build segment |
| POST | `/generate-year-end-receipts` | Orchestrator: year-end totals |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_donors` | yes | List donors |
| `get_donor` | yes | Get donor |
| `create_donor` | no | Create donor |
| `list_donations` | yes | List donations |
| `record_donation` | no | Record a gift |
| `list_campaigns` | yes | List campaigns |
| `create_campaign` | no | Create campaign |
| `list_pledges` | yes | List pledges |
| `create_pledge` | no | Record a pledge |
| `list_recurring_gifts` | yes | List sustaining gifts |
| `identify_lapsed_donors` | yes | Orchestrator — lapsed donors |
| `segment_for_campaign` | yes | Orchestrator — donor segment |
| `generate_year_end_receipts` | yes | Orchestrator — year-end totals |

## The AI angle

Fundraising is a relationship problem and relationships are LLM-shaped. `identify_lapsed_donors` lets an agent build a re-engagement list filtered by lifetime giving. `segment_for_campaign` lets it draft a target list per campaign with prior-donor affinity. `generate_year_end_receipts` lets it produce all receipts in one batch and hand them off to your email or print mailer.

## Extending

- **Acknowledgement workflow:** add a `Thank You Letter` repository, schedule one per donation.
- **Wealth scoring:** extend `Donor` with capacity / inclination flags from a 3rd-party screen.
- **Switch databases:** change `DB_PROVIDER` in `.env`. Handler code never changes.

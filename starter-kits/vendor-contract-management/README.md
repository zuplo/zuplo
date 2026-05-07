# Vendor & Contract Management Starter Kit

Headless vendor relationship and contract management API. Replaces Vendr, Tropic, and Ironclad-lite.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/vendor-contract-management
cd starter-kits/vendor-contract-management
cp env.example .env
npm install
npm run dev
```

Connect an MCP inspector at `http://localhost:9000/mcp`.

## Choosing a database

| Adapter | Status |
|---|---|
| `in-memory` | Default |
| `supabase` | Supported |
| `firestore` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

## Environment variables

See [env.example](./env.example).

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contracts` | List contracts |
| POST | `/contracts` | Create contract |
| GET | `/contracts/{id}` | Get contract |
| PATCH | `/contracts/{id}` | Update contract |
| POST | `/contracts/{id}/terminate` | Terminate (destructive) |
| GET | `/vendors` | List vendors |
| POST | `/vendors` | Create vendor |
| GET | `/vendors/{id}` | Get vendor |
| GET | `/renewals` | List renewals |
| POST | `/renewals` | Schedule renewal |
| GET | `/risk-assessments` | List assessments |
| POST | `/risk-assessments` | Record assessment |
| GET | `/spend` | List spend records |
| POST | `/flag-upcoming-renewals` | Orchestrator: renewals on the horizon |
| POST | `/compare-vendor-pricing` | Orchestrator: vendor pricing in a category |
| POST | `/calc-total-spend` | Orchestrator: spend rollup |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_contracts` | yes | List contracts |
| `get_contract` | yes | Get a contract |
| `create_contract` | no | Create a contract |
| `update_contract` | no | Patch contract fields |
| `terminate_contract` | destructive | Move contract to terminated |
| `list_vendors` | yes | List vendors |
| `get_vendor` | yes | Get a vendor |
| `create_vendor` | no | Register a vendor |
| `list_renewals` | yes | List renewals |
| `schedule_renewal` | no | Schedule a renewal |
| `list_risk_assessments` | yes | List assessments |
| `record_assessment` | no | Record an assessment |
| `list_spend` | yes | List spend records |
| `flag_upcoming_renewals` | yes | Surface renewals approaching |
| `compare_vendor_pricing` | yes | Vendor pricing in a category |
| `calc_total_spend` | yes | Spend rollup |

## The AI angle

`flag_upcoming_renewals` becomes the heart of an autonomous renewals workflow: filter active contracts whose endDate is approaching and whose notice window is open, send the list to a procurement agent. `compare_vendor_pricing` lets an LLM benchmark options when one vendor signals a price increase. `calc_total_spend` answers "how much did we spend with X this year" without a CSV.

## Extending

- **Add a contract attribute:** edit `Contract` interface in `modules/repositories/contracts.ts` and the OpenAPI schema.
- **Add an orchestrator:** create a handler in `modules/mcp-tools/`, register the route + `mcp` annotation, and add the operationId to the `/mcp` operations array.
- **Switch databases:** change `DB_PROVIDER` in `.env`.

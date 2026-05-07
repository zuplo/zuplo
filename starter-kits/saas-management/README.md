# SaaS Management Starter Kit

Headless SaaS subscription, license, seat, and usage management API. Replaces Zylo, Productiv, and Torii.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/saas-management
cd starter-kits/saas-management
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
| GET | `/apps` | List SaaS apps |
| POST | `/apps` | Register an app |
| GET | `/apps/{id}` | Get an app |
| PATCH | `/apps/{id}` | Update an app |
| GET | `/licenses` | List licenses |
| POST | `/licenses` | Assign a license |
| POST | `/licenses/{id}/revoke` | Revoke license (destructive) |
| GET | `/usage` | List usage |
| POST | `/usage` | Record usage window |
| GET | `/renewals` | List planned renewals |
| POST | `/renewals` | Plan a renewal |
| POST | `/find-unused-licenses` | Orchestrator: stale licenses |
| POST | `/recommend-seat-reduction` | Orchestrator: seat sizing |
| POST | `/forecast-renewal-cost` | Orchestrator: spend forecast |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_apps` | yes | List SaaS apps |
| `get_app` | yes | Get an app |
| `register_app` | no | Register an app |
| `update_app` | no | Patch app fields |
| `list_licenses` | yes | List licenses |
| `assign_license` | no | Assign license |
| `revoke_license` | destructive | Revoke license |
| `list_usage` | yes | List usage |
| `record_usage_window` | no | Record usage |
| `list_renewals` | yes | List renewals |
| `plan_renewal` | no | Plan renewal |
| `find_unused_licenses` | yes | Stale licenses |
| `recommend_seat_reduction` | yes | Seat sizing |
| `forecast_renewal_cost` | yes | Spend forecast |

## The AI angle

`find_unused_licenses` lets a finance agent say "show me reclaim candidates" and get a ranked list. `recommend_seat_reduction` translates "right-size Notion" into an exact seat count and dollar saving. `forecast_renewal_cost` answers budget-cycle questions like "what's our SaaS spend hitting in Q3" without a spreadsheet.

## Extending

- **Add a new SaaS field:** edit `SaaSApp` in `modules/repositories/apps.ts` and the OpenAPI schema.
- **Add an orchestrator:** create a handler in `modules/mcp-tools/`, register the route + `mcp` annotation, and add the operationId to the `/mcp` operations array.
- **Switch databases:** change `DB_PROVIDER` in `.env`.

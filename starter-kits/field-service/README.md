# Field Service / Inspection API

Headless field-service API that does the actual back-office work — geocodes job sites and runs a real route optimizer with Mapbox, mints presigned R2 upload URLs for inspection photos, and texts techs their next stop via Twilio. Plus an MCP server an agent can drive to plan tomorrow's routes.

Replaces: ServiceTitan, Jobber, Housecall Pro.

## Wires up

- **Mapbox** — `optimize_route_for_day` geocodes each job's `siteAddress` (Geocoding API), fetches a drive-time + distance matrix between every pair of stops (Directions Matrix API), and runs a greedy nearest-neighbor solve to return the lowest-time visit order.
- **Cloudflare R2** — `presign_photo_upload` returns AWS-Signature-V4 presigned PUT URLs that the technician's mobile app uploads photo bytes directly to, without proxying through the edge runtime. The kit signs presigned URLs in pure Web Crypto — no AWS SDK.
- **Twilio SMS** — `optimize_route_for_day` (with `notifyTechnician=true`) texts the tech their first three stops; the same integration is reusable for "on the way" customer notifications.

## Architecture at a glance

```
Tech app / dispatcher / agent ──▶ Zuplo Gateway ──▶ Integration handlers
                                      │                  ├── Mapbox    (geocoding + drive-time matrix)
                                      │                  ├── R2        (presigned photo uploads)
                                      │                  └── Twilio    (route + dispatch SMS)
                                      ▼
                              Database adapter (Supabase / Firestore / Neon / Upstash)
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/field-service
cd field-service
cp env.example .env
npm install
npm run dev
```

The gateway boots at `http://localhost:9000`. To explore the MCP server:

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

## Choosing a database

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) — default |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default — the kit boots without any credentials so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER`:

- `MAPBOX_ACCESS_TOKEN` (route optimization falls back to time-ordering if unset)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_PUBLIC_BASE_URL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

## API surface

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/checklists` | `submit_checklist` | tool |
| GET | `/customers` | `list_customers` | tool |
| POST | `/customers` | `create_customer` | tool |
| POST | `/draft-estimate-from-inspection` | `draft_estimate_from_inspection` | tool |
| POST | `/flag-recurring-failures-at-site` | `flag_recurring_failures_at_site` | tool |
| POST | `/inspections` | `submit_inspection` | tool |
| GET | `/invoices` | `list_invoices` | tool |
| POST | `/invoices` | `create_invoice` | tool |
| GET | `/jobs` | `list_jobs` | tool |
| POST | `/jobs` | `create_job` | tool |
| GET | `/jobs/{id}` | `get_job` | tool |
| POST | `/jobs/{id}/complete` | `complete_job` | tool |
| POST | `/optimize-route-for-day` | `optimize_route_for_day` | tool |
| POST | `/photos` | `upload_photo` | tool |
| POST | `/photos/presign-upload` | `presign_photo_upload` | tool |
| GET | `/technicians` | `list_technicians` | tool |
| POST | `/mcp` | `mcp_handler` | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Calls | Description |
|---|---|---|
| `optimize_route_for_day` | Mapbox + Twilio | Geocode + matrix + nearest-neighbor solve, optionally text the tech. |
| `presign_photo_upload` | R2 | Mint a presigned PUT URL for direct mobile uploads. |
| `flag_recurring_failures_at_site` | — | Surface inspection items that fail repeatedly at a customer site. |
| `draft_estimate_from_inspection` | — | Produce a per-finding draft estimate the LLM can polish. |
| (plus CRUD) | — | `list_jobs`, `create_job`, `get_job`, `complete_job`, `list_customers`, `create_customer`, `list_technicians`, `submit_inspection`, `upload_photo`, `submit_checklist`, `list_invoices`, `create_invoice`. |

## The AI angle

`optimize_route_for_day` is the load-bearing tool. It does what a human dispatcher would do across three tabs (Google Maps for ETAs, the schedule app for stop order, an SMS app to ping the tech): one MCP call and the tech wakes up to a drivable order plus a text with their next three stops. `presign_photo_upload` removes the equivalent friction on the tech's side — instead of emailing photos to dispatch, the mobile app PUTs straight to R2 and registers the metadata. `flag_recurring_failures_at_site` surfaces the systemic issues that no one sees because each ticket is closed in isolation.

## Extending

- **Swap routing provider.** Replace `modules/integrations/mapbox.ts` with Google Maps Distance Matrix or HERE Maps. Keep the matrix shape and the orchestrator stays put.
- **Smarter route solver.** Mapbox has an [Optimization API](https://docs.mapbox.com/api/navigation/optimization/) that handles up to 12 stops with constraints (time windows, capacity). Swap the greedy nearest-neighbor solve for an Optimization v2 call.
- **Swap object storage.** Replace `modules/integrations/r2.ts` with S3, GCS, or Backblaze B2. The signing routine is generic AWS-V4 and works against any S3-compatible endpoint with minor tweaks.
- **Customer "on the way" SMS.** Reuse `sendTwilioSms` in `complete_job` (or add a `mark-in-progress.ts`) to text the customer when the tech leaves the previous site.
- **Switch databases.** Change `DB_PROVIDER` in `.env`. Handler code never changes.

# SaaS Management Starter Kit

A real SaaS-management spine: point it at your IdPs (Google Workspace, Microsoft 365, Okta) and it discovers every app the company is signed into, pulls authoritative seat counts, and feeds the renewal/seat-reduction orchestrators.

Replaces: Zylo, Productiv, Torii.

## Wires up

- **Google Workspace Admin SDK** lists workspace users and the Reports API surfaces every OAuth-authorized third-party app — the most accurate signal for "what are people actually logged into?"
- **Microsoft Graph** lists `subscribedSkus` (the source of truth for M365 seat counts) and consented service principals (your Microsoft-side shadow IT).
- **Okta** lists active users plus assigned-user counts per app — Okta sees every SSO sign-in, so this is the cleanest seat baseline if SSO is mandatory.

The `discover_apps` orchestrator queries all three, merges by slug (so duplicates collapse), and upserts the catalog.

## Architecture at a glance

```
                    ┌────── Google Workspace Admin SDK ──────┐
discover_apps ──────┼────── Microsoft Graph (Entra ID) ──────┼──► merge ──► saasAppRepository
(MCP tool)          └────── Okta API                  ───────┘                (upsert by slug)
                                                                                     │
                                                                                     ▼
                                                                         find_unused_licenses /
                                                                         recommend_seat_reduction /
                                                                         forecast_renewal_cost
```

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/saas-management
cd starter-kits/saas-management
cp env.example .env
npm install
npm run dev
```

OAuth setup:

1. **Google**: register an OAuth client in GCP, add `https://your-zuplo-host/oauth/google/callback` as a redirect URI, then visit the consent URL with `access_type=offline&prompt=consent` and the scopes from `env.example`. The callback returns the refresh token; persist it as `GOOGLE_REFRESH_TOKEN`.
2. **Microsoft**: register an app in Entra, grant `Directory.Read.All` and `Application.Read.All` *application* permissions with admin consent, then put the client id / secret / tenant id in `.env`. The callback at `/oauth/microsoft/callback` is only used during admin-consent confirmation.
3. **Okta**: create an API token (Read-Only Admin role) and set `OKTA_API_TOKEN` + `OKTA_ORG_URL`.

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

See [env.example](./env.example). Beyond `DB_PROVIDER` you'll want credentials for the IdPs you care about — discovery silently skips providers without credentials.

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
| POST | `/discover-apps` | Orchestrator: discover from IdPs + upsert |
| POST | `/find-unused-licenses` | Orchestrator: stale licenses |
| POST | `/recommend-seat-reduction` | Orchestrator: seat sizing |
| POST | `/forecast-renewal-cost` | Orchestrator: spend forecast |
| GET | `/oauth/google/callback` | OAuth callback for Google consent |
| GET | `/oauth/microsoft/callback` | OAuth callback for Microsoft admin consent |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `list_apps` | yes | DB | List SaaS apps |
| `get_app` | yes | DB | Get an app |
| `register_app` | no | DB | Register an app |
| `update_app` | no | DB | Patch app fields |
| `list_licenses` | yes | DB | List licenses |
| `assign_license` | no | DB | Assign license |
| `revoke_license` | destructive | DB | Revoke license |
| `list_usage` | yes | DB | List usage |
| `record_usage_window` | no | DB | Record usage |
| `list_renewals` | yes | DB | List renewals |
| `plan_renewal` | no | DB | Plan renewal |
| `discover_apps` | no | Google + MS Graph + Okta + DB | Auto-discover apps + seat counts |
| `find_unused_licenses` | yes | DB | Stale licenses |
| `recommend_seat_reduction` | yes | DB | Seat sizing |
| `forecast_renewal_cost` | yes | DB | Spend forecast |

## The AI angle

`discover_apps` is the orchestrator that turns this from a CRUD app into a real SaaS-management product. With one call:

1. Hit Google's Reports API (`/activity/users/all/applications/token`) — every OAuth grant in the last 30 days, grouped by app.
2. Hit Microsoft Graph `/subscribedSkus` for authoritative M365 seat counts plus `/servicePrincipals` for consented third-party apps.
3. Hit Okta `/api/v1/apps` for every SSO-routed app and count assigned users.
4. Merge by slug (so "Slack" appearing in two IdPs collapses), upsert the catalog with `status: under_review`, and return the diff.

Pair with `find_unused_licenses` and `recommend_seat_reduction` for an end-to-end spend-cleanup flow that an agent can run on demand. There's no cron — call it from the MCP host on whatever cadence makes sense.

## Extending

- **Add Slack as a discovery source**: drop `slack.ts` in `modules/integrations/`, hit `users.list` for the workspace, and add a fourth branch to `discover_apps`.
- **Per-tenant IdP credentials**: in production each tenant needs its own refresh tokens. Move the credential reads from `environment.*` to a per-tenant secrets repository keyed by `tenantId`.
- **Cost lookup**: integrations like Vendr or Tropic expose contract prices — add a `vendr.ts` and call it inside `discover_apps` to populate `annualCostCents`.
- **Switch databases**: change `DB_PROVIDER` in `.env`.

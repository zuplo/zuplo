# Incident & Change Management API

A real, runnable incident management spine: PagerDuty fires the alert, this gateway records the incident, broadcasts it to Slack, and lets agents (or humans) post threaded updates and assess change risk against recent failures.

Replaces: PagerDuty incidents, ServiceNow Change, FireHydrant.

## Wires up

- **PagerDuty** → `/webhooks/pagerduty` receives `incident.triggered`, `incident.acknowledged`, and `incident.resolved`. The handler verifies the HMAC signature, mirrors the incident into our store, and broadcasts to Slack.
- **Slack** → `declare_incident`, `post_incident_update`, and the PagerDuty webhook all post to `#incidents` (configurable). When a bot token is provided we capture `ts` for thread-per-incident hygiene.

`assess_change_risk` is in-process: it scores `kind`, affected service count, and overlapping incidents in the last 14 days — no external LLM call needed.

## Architecture at a glance

```
PagerDuty ─▶ POST /webhooks/pagerduty
                │
                ▼
         Zuplo Gateway
                │
   ┌────────────┼─────────────┐
   ▼            ▼             ▼
Incidents     declare_       Slack #incidents
   DB        incident        (broadcast +
              (Slack          per-update
              broadcast)      mirror)
```

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/incident-change-management
cd incident-change-management
cp env.example .env
npm install
npm run dev
```

The gateway boots at `http://localhost:9000`. Connect an MCP inspector at `http://localhost:9000/mcp`.

## Choosing a database

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default.

## Environment variables

See [env.example](./env.example). Beyond `DB_PROVIDER` you'll want:

- **PagerDuty** (`PAGERDUTY_WEBHOOK_SECRET`) for inbound webhook verification
- **Slack** (`SLACK_BOT_TOKEN` or `SLACK_WEBHOOK_URL`) for incident broadcast

## API surface

| Method | Path | Operation ID |
|---|---|---|
| POST | `/declare-incident` | `declare_incident` |
| POST | `/resolve-incident` | `resolve_incident` |
| GET | `/incidents` | `list_incidents` |
| GET | `/incident/{id}` | `get_incident` |
| POST | `/post-incident-update` | `post_incident_update` |
| POST | `/propose-change` | `propose_change` |
| POST | `/change/{id}/approve` | `approve_change` |
| POST | `/change/{id}/complete` | `complete_change` |
| POST | `/change/{id}/reject` | `reject_change` |
| GET | `/changes` | `list_changes` |
| POST | `/draft-postmortem` | `draft_postmortem` |
| POST | `/postmortem/{id}/publish` | `publish_postmortem` |
| GET | `/postmortems` | `list_postmortems` |
| GET | `/oncall-schedule` | `list_oncall_schedule` |
| POST | `/assess-change-risk` | `assess_change_risk` |
| POST | `/current-oncall-for-service` | `current_oncall_for_service` |
| POST | `/summarize-timeline` | `summarize_timeline` |
| POST | `/webhooks/pagerduty` | `pagerduty_webhook` |
| POST | `/mcp` | `mcp_handler` |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## Webhooks (inbound)

| Path | Provider | Notes |
|---|---|---|
| `POST /webhooks/pagerduty` | PagerDuty | HMAC-signed (`x-pagerduty-signature: v1=...`). Mirrors `incident.triggered/acknowledged/resolved`. |

## MCP tools

| Tool | Read-only | Calls | Description |
|---|---|---|---|
| `declare_incident` | no | DB + Slack | Open an incident, broadcast to Slack |
| `resolve_incident` | no | DB | Mark resolved |
| `list_incidents` | yes | DB | List incidents in tenant |
| `get_incident` | yes | DB | Get incident |
| `post_incident_update` | no | DB + Slack | Post update + Slack mirror |
| `propose_change` | no | DB | Propose a change |
| `approve_change` | no | DB | Approve a change |
| `complete_change` | no | DB | Mark a change complete |
| `reject_change` | destructive | DB | Reject a change |
| `list_changes` | yes | DB | List changes |
| `draft_postmortem` | no | DB | Draft postmortem from incident |
| `publish_postmortem` | no | DB | Publish postmortem |
| `list_postmortems` | yes | DB | List postmortems |
| `list_oncall_schedule` | yes | DB | List on-call schedule |
| `assess_change_risk` | yes | DB | Score change risk vs. recent incidents |
| `current_oncall_for_service` | yes | DB | Find current on-call for a service |
| `summarize_timeline` | yes | DB | Build chronological incident timeline |

## The AI angle

The end-to-end story: PagerDuty triggers an incident → the kit creates the row, broadcasts to Slack with the service name and a link back to PagerDuty, then a human (or an MCP-driven agent) calls `assess_change_risk` to check whether a recent change might be the cause. `summarize_timeline` collapses every update into a chronological string suitable for a Slack pin or a postmortem template.

`assess_change_risk` is intentionally heuristic — it looks at change kind, affected services, and overlapping incidents in the last 14 days. Plug Claude into the orchestrator (drop an `anthropic.ts` integration alongside `pagerduty.ts` and call it from `assess-change-risk.ts`) when you want the LLM to also read the change description and the recent incidents' root-cause text.

## Extending

- **Drop in Anthropic for richer assessments**: add `modules/integrations/claude.ts` and call it from `assess-change-risk.ts` after the heuristic score — the heuristic gives you a deterministic baseline; Claude adds context.
- **Page additional channels**: replace `slack.ts` or call multiple integrations from `declare-incident.ts` (e.g. Microsoft Teams, Opsgenie).
- **Customer-facing comms**: post `post_incident_update` updates with `audience: "customer"` to a separate channel or status page (see the `status-page` kit).
- **Switch databases**: change `DB_PROVIDER` in `.env`.

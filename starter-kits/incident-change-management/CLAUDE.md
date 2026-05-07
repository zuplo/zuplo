# Incident & Change Management API

Incidents, changes, postmortems, and on-call with MCP tools that summarize timelines, assess change risk, and find current on-call.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/assess-change-risk` | `assess_change_risk` | tool |
| POST | `/change/{id}/approve` | `approve_change` | tool |
| POST | `/change/{id}/complete` | `complete_change` | tool |
| POST | `/change/{id}/reject` | `reject_change` | tool |
| GET | `/changes` | `list_changes` | tool |
| POST | `/current-oncall-for-service` | `current_oncall_for_service` | tool |
| POST | `/declare-incident` | `declare_incident` | tool |
| POST | `/draft-postmortem` | `draft_postmortem` | tool |
| GET | `/incident/{id}` | `get_incident` | tool |
| GET | `/incidents` | `list_incidents` | tool |
| GET | `/oncall-schedule` | `list_oncall_schedule` | tool |
| POST | `/post-incident-update` | `post_incident_update` | tool |
| POST | `/postmortem/{id}/publish` | `publish_postmortem` | tool |
| GET | `/postmortems` | `list_postmortems` | tool |
| POST | `/propose-change` | `propose_change` | tool |
| POST | `/resolve-incident` | `resolve_incident` | tool |
| POST | `/summarize-timeline` | `summarize_timeline` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

17 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `approve_change`
- `complete_change`
- `declare_incident`
- `draft_postmortem`
- `get_incident`
- `list_changes`
- `list_incidents`
- `list_oncall_schedule`
- `list_postmortems`
- `post_incident_update`
- `propose_change`
- `publish_postmortem`
- `reject_change`
- `resolve_incident`
- `assess_change_risk`
- `current_oncall_for_service`
- `summarize_timeline`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 17 entries above.

## Replaces

- PagerDuty incidents
- ServiceNow Change
- FireHydrant

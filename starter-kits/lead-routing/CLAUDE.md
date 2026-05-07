# Lead Routing / SDR Starter Kit

Headless API for SDR teams. Replaces Chili Piper, LeanData, Salesforce Flow routing. See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Lead` | The parent SDR funnel record. |
| `RoutingRule` | Priority-ordered match-and-assign rule. |
| `Territory` | Named pool of reps with criteria. |
| `Cadence` | Outreach sequence template. |
| `MeetingBooking` | Scheduled discovery / demo. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leads` | List leads |
| POST | `/leads` | Create lead |
| GET | `/leads/{id}` | Get lead |
| PATCH | `/leads/{id}/assign` | Assign |
| PATCH | `/leads/{id}/qualify` | Qualify |
| PATCH | `/leads/{id}/disqualify` | Disqualify |
| GET | `/routing-rules` | List rules |
| POST | `/routing-rules` | Create rule |
| GET | `/territories` | List territories |
| POST | `/meeting-bookings` | Book meeting |
| POST | `/route-lead-intelligently` | Orchestrator |
| POST | `/match-lead-to-account` | Orchestrator |
| POST | `/summarize-unworked-leads` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `route_lead_intelligently` — loads the lead, walks active routing rules in priority order, picks the first match, calls `assign_lead`. Returns the chosen rule plus a per-rule trace.
- `match_lead_to_account` — finds existing leads sharing the input lead's email domain (skips free-mail).
- `summarize_unworked_leads` — finds assigned leads still in 'new' or 'contacted' status with `assignedAt` older than `daysSince` days, grouped by owner.

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.

# Status Page Kit

A Zuplo Starter Kit for a customer-facing status page. Replaces Statuspage.io, Instatus, and Atlassian Statuspage.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Routes + MCP annotations (Layer 1) + `/mcp` operations array (Layer 2) |
| `config/policies.json` | api-key-inbound, rate-limit, prompt-injection-outbound, secret-masking-outbound |
| `modules/repositories/incidents.ts` | Incident entity (the timeline) |
| `modules/repositories/components.ts` | Component entity (rows on the public page) |
| `modules/repositories/incident-updates.ts` | IncidentUpdate timeline-entry entity |
| `modules/repositories/maintenance.ts` | Maintenance scheduled-window entity |
| `modules/repositories/subscribers.ts` | Subscriber entity |
| `modules/handlers/*.ts` | One file per CRUD endpoint |
| `modules/mcp-tools/open-incident-from-alert.ts` | Orchestrator: opens an incident, posts the first update, downgrades affected components |
| `modules/mcp-tools/draft-customer-update.ts` | Orchestrator: returns a ready-to-post timeline update body |
| `modules/mcp-tools/post-postmortem-summary.ts` | Orchestrator: posts a final postmortem update |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/components` | List components |
| POST | `/components` | Create component |
| GET | `/components/{id}` | Get component |
| PATCH | `/components/{id}/status` | Update component status |
| GET | `/incidents` | List incidents |
| POST | `/incidents` | Open an incident |
| GET | `/incidents/{id}` | Get incident |
| POST | `/incidents/{id}/updates` | Post a timeline update |
| PATCH | `/incidents/{id}/resolve` | Resolve incident |
| GET | `/maintenance` | List maintenance windows |
| POST | `/maintenance` | Schedule maintenance |
| PATCH | `/maintenance/{id}/complete` | Complete maintenance |
| GET | `/subscribers` | List subscribers |
| POST | `/subscribers` | Add subscriber |
| DELETE | `/subscribers/{id}` | Remove subscriber |
| POST | `/open-incident-from-alert` | Orchestrator: open + announce + degrade |
| POST | `/draft-customer-update` | Orchestrator: draft a ready-to-post update |
| POST | `/post-postmortem-summary` | Orchestrator: post a final postmortem update |
| POST | `/mcp` | MCP server endpoint |

## Orchestrator rationale

`open_incident_from_alert` is the kit's headline AI tool. When a monitoring alert fires at 2am, the on-caller has to do three things — open the incident, post the first public update, and bump every affected component to a non-green status. This orchestrator does all three by calling the public CRUD routes, so it inherits the same auth and rate-limit policies as the rest of the API.

`draft_customer_update` lets an LLM author the next timeline entry without having to reconstruct the timeline itself. It returns a ready-to-post body shaped for either a customer or internal audience, plus the supporting context.

`post_postmortem_summary` closes the loop after resolution: take a long postmortem, truncate it to a customer-friendly length, optionally include a link to the full writeup, and post it as the final timeline entry.

## Verifying the kit boots

```bash
cp env.example .env
npm install
npm run dev
# In another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

The Inspector should show 18 tools — `list_components`, `get_component`, `create_component`, `update_component_status`, `list_incidents`, `get_incident`, `open_incident`, `post_incident_update`, `resolve_incident`, `list_maintenance`, `schedule_maintenance`, `complete_maintenance`, `list_subscribers`, `add_subscriber`, `remove_subscriber`, `open_incident_from_alert`, `draft_customer_update`, `post_postmortem_summary`.

# Status Page API

A Zuplo Starter Kit that ships a fully-tenanted status page API together with an MCP server — agents can open incidents from alerts, post timeline updates, schedule maintenance, and manage subscribers through plain HTTP or through MCP tools.

Replaces: Statuspage.io, Instatus, Atlassian Statuspage.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/status-page  # already done if you cloned the kit
cd starter-kits/status-page
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
| `clickhouse` | Supported |
| `upstash-redis` | Supported |
| `neon` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example).

The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke-test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/components` | List components in display order |
| POST | `/components` | Register a new component |
| GET | `/components/{id}` | Get a component |
| PATCH | `/components/{id}/status` | Update a component's status |
| GET | `/incidents` | List incidents (filter by status, kind) |
| POST | `/incidents` | Open a new incident |
| GET | `/incidents/{id}` | Get an incident |
| POST | `/incidents/{id}/updates` | Post a timeline update |
| PATCH | `/incidents/{id}/resolve` | Mark an incident resolved |
| GET | `/maintenance` | List maintenance windows |
| POST | `/maintenance` | Schedule a maintenance window |
| PATCH | `/maintenance/{id}/complete` | Mark a maintenance window complete |
| GET | `/subscribers` | List subscribers |
| POST | `/subscribers` | Add a subscriber |
| DELETE | `/subscribers/{id}` | Remove a subscriber |
| POST | `/open-incident-from-alert` | Orchestrator: open + announce + degrade |
| POST | `/draft-customer-update` | Orchestrator: draft a customer update |
| POST | `/post-postmortem-summary` | Orchestrator: post a final postmortem |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_components` | tool | yes | List components in display order |
| `get_component` | tool | yes | Get a component |
| `create_component` | tool | no | Register a new component |
| `update_component_status` | tool | idempotent | Change a component's status |
| `list_incidents` | tool | yes | List incidents |
| `get_incident` | tool | yes | Get an incident |
| `open_incident` | tool | no | Open a new incident |
| `post_incident_update` | tool | no | Append a timeline update |
| `resolve_incident` | tool | idempotent | Mark an incident resolved |
| `list_maintenance` | tool | yes | List maintenance windows |
| `schedule_maintenance` | tool | no | Schedule a maintenance window |
| `complete_maintenance` | tool | idempotent | Complete a maintenance window |
| `list_subscribers` | tool | yes | List subscribers |
| `add_subscriber` | tool | no | Add a subscriber |
| `remove_subscriber` | tool | destructive | Remove a subscriber |
| `open_incident_from_alert` | tool | no | Open + announce + degrade (orchestrator) |
| `draft_customer_update` | tool | yes | Draft a ready-to-post update (orchestrator) |
| `post_postmortem_summary` | tool | no | Post the final postmortem update (orchestrator) |

## The AI angle

Three orchestrators turn a status page from a static dashboard into something an assistant can drive end-to-end. `open_incident_from_alert` collapses the 2am on-caller checklist (open → first update → degrade components) into one tool call. `draft_customer_update` reads the timeline and produces ready-to-post copy without the LLM having to invent the wording from scratch. `post_postmortem_summary` closes the loop after resolution by truncating a long postmortem into a customer-friendly final update with an optional link to the full writeup.

## Extending

- **Real subscriber notifications:** add an outbound webhook policy on `post_incident_update` that pushes to email / Slack for each subscriber whose `notifyOnImpact` allows the incident's impact level.
- **Component groups:** group components by `parentSlug` for the public view; the schema already carries the field.
- **Public read-only routes:** drop the `api-key-inbound` policy on the GET routes if you want anonymous browsing of the page.
- **New endpoint:** create a handler in `modules/handlers/`, add the route in `routes.oas.json` with `mcp: { type: "tool" }`, and register the `operationId` in the `/mcp` route's `operations: [...]` array.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

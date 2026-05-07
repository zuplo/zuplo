# Legal Matter Management API

Headless matter management for law firms backed by an MCP server. Manage clients, matters, documents, deadlines, time entries, and conflict checks — with AI-friendly orchestrator tools that pre-screen intakes, summarize matter status, and draft client status letters.

Replaces: Clio, MyCase, PracticePanther.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/legal-matter-management
cd starter-kits/legal-matter-management
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

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example). The kit boots with `DB_PROVIDER=in-memory` and zero other env vars.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clients` | List clients |
| GET | `/clients/{id}` | Get a client |
| POST | `/clients` | Create a client |
| GET | `/matters` | List matters |
| GET | `/matters/{id}` | Get a matter |
| POST | `/matters` | Open a matter |
| PATCH | `/matters/{id}/close` | Close a matter |
| GET | `/documents` | List matter documents |
| POST | `/documents` | Attach a document |
| GET | `/deadlines` | List deadlines |
| POST | `/deadlines` | Add a deadline |
| PATCH | `/deadlines/{id}/complete` | Mark deadline complete |
| GET | `/time-entries` | List time entries |
| POST | `/time-entries` | Log a time entry |
| GET | `/conflicts` | List conflict-check records |
| POST | `/conflicts` | Record a conflict check |
| POST | `/check-conflict-before-intake` | Orchestrator: pre-flight intake screen |
| POST | `/summarize-matter-status` | Orchestrator: matter status summary |
| POST | `/draft-status-letter-to-client` | Orchestrator: draft status letter |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_clients` | yes | List clients |
| `get_client` | yes | Get a client |
| `create_client` | no | Add a client |
| `list_matters` | yes | List matters |
| `get_matter` | yes | Get a matter |
| `open_matter` | no | Open a matter |
| `close_matter` | no (idempotent) | Close a matter |
| `list_documents` | yes | List documents |
| `upload_document` | no | Attach a document |
| `list_deadlines` | yes | List deadlines |
| `add_deadline` | no | Add a deadline |
| `complete_deadline` | no (idempotent) | Mark deadline complete |
| `list_time_entries` | yes | List time entries |
| `log_time_entry` | no | Log a time entry |
| `list_conflicts` | yes | List conflict-check records |
| `run_conflict_check` | no | Record a conflict-check decision |
| `check_conflict_before_intake` | yes | Pre-flight intake conflict screen |
| `summarize_matter_status` | yes | One-screen matter status |
| `draft_status_letter_to_client` | yes | Draft a status letter to the client |

## The AI angle

Legal teams spend disproportionate time on intake conflict screens, status updates, and client letters. The orchestrators do the gathering work: `check_conflict_before_intake` tokenises a prospect's name and scans every client, conflicts list, and matter title/description in one call; `summarize_matter_status` returns the matter plus open deadlines + recent docs + recent time entries in a single object the agent can ground a memo on; `draft_status_letter_to_client` skips privileged docs and produces a structured plain-text draft. Three calls instead of fifteen, and the agent stays inside firm policy.

## Extending

- **New entity** (e.g. `Invoice`, `TrustAccount`): add it to `modules/repositories/matters.ts`, then add a CRUD route in `routes.oas.json`.
- **New orchestrator** (e.g. `find_overdue_deadlines_by_attorney`): drop a file in `modules/mcp-tools/`, register the operationId in the `/mcp` operations array.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

# Internal Announcements & Changelog API

Headless internal announcements service backed by an MCP server. Stand up an internal "what changed this week" feed in minutes, with API key auth, multi-tenancy, and a curated MCP toolset for LLM agents that can find unread critical items, summarize a team's week, or draft a changelog from merged PRs.

Replaces: Headway, Beamer, and ad-hoc Slack #announcements channels.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/announcements-changelog
cd starter-kits/announcements-changelog
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
| GET | `/announcements` | List announcements |
| POST | `/announcements` | Create a draft announcement |
| GET | `/announcements/{id}` | Get an announcement |
| PATCH | `/announcements/{id}/schedule` | Move to scheduled |
| PATCH | `/announcements/{id}/publish` | Move to published |
| PATCH | `/announcements/{id}/archive` | Move to archived |
| GET | `/audiences` | List audiences |
| POST | `/audiences` | Create an audience |
| GET | `/acknowledgements` | List acknowledgements |
| POST | `/acknowledgements` | Acknowledge an announcement |
| GET | `/categories` | List categories |
| POST | `/find-unread-critical-for-user` | Orchestrator: unread critical items for a user |
| POST | `/summarize-week-for-team` | Orchestrator: weekly digest grouped by category |
| POST | `/draft-changelog-from-merged-prs` | Orchestrator: draft a changelog from PR titles |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_announcements` | yes | List announcements |
| `get_announcement` | yes | Get an announcement by id |
| `create_announcement` | no | Create a draft |
| `schedule_announcement` | no (idempotent) | Move to scheduled |
| `publish_announcement` | no (idempotent) | Publish immediately |
| `archive_announcement` | destructive | Archive (removed from feeds) |
| `list_audiences` | yes | List audiences |
| `create_audience` | no | Create an audience |
| `list_acknowledgements` | yes | List acknowledgements |
| `acknowledge_announcement` | no | Record an acknowledgement |
| `list_categories` | yes | List categories |
| `find_unread_critical_for_user` | yes | Unread critical items for a user |
| `summarize_week_for_team` | yes | Weekly digest grouped by category |
| `draft_changelog_from_merged_prs` | yes | Draft a release announcement from PRs |

## The AI angle

The orchestrator tools take this from "rest API" to "agent-native service". `find_unread_critical_for_user` joins announcements + acknowledgements server-side, so an agent doesn't have to paginate two endpoints and diff them. `summarize_week_for_team` returns a category-grouped payload primed for an LLM to write a Monday digest. `draft_changelog_from_merged_prs` shows the read-only-draft pattern — the gateway formats text, the agent decides whether to publish.

## Extending

- **New entity** (e.g. `Reaction`, `Subscriber`): add it to `modules/repositories/announcements.ts`, then add a CRUD route in `routes.oas.json`.
- **New orchestrator** (e.g. `who_needs_a_reminder`): drop a file in `modules/mcp-tools/`, register the operationId in the `/mcp` operations array.
- **Switch databases:** change `DB_PROVIDER`. Handler code never changes.

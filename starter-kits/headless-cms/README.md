# Headless CMS API

A Zuplo Starter Kit for a multi-tenant headless CMS — content types, localised entries, revisions, an asset library, and authors — all addressable through HTTP and through MCP. Agents can list and edit content the same way humans do, including bulk content-ops automations like stale-content audits, locale forking, and related-link suggestions.

Replaces: Contentful, Sanity, headless WordPress.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/headless-cms  # already done if you cloned the kit
cd starter-kits/headless-cms
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
| `neon` | Supported |
| `upstash-redis` | Supported |

Pick one via `DB_PROVIDER` and fill in the matching credentials in `.env`. See [env.example](./env.example).

## Environment variables

See [env.example](./env.example).

The kit boots with `DB_PROVIDER=in-memory` if no env vars are set.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/content-types` | List content types |
| POST | `/content-types` | Create a content type |
| GET | `/content-types/{id}` | Get a content type |
| GET | `/entries` | List entries (filter by contentTypeSlug, status, locale) |
| POST | `/entries` | Create an entry (defaults to draft) |
| GET | `/entries/{id}` | Get an entry |
| PATCH | `/entries/{id}` | Update entry fields |
| PATCH | `/entries/{id}/publish` | Publish entry |
| PATCH | `/entries/{id}/unpublish` | Move back to draft |
| PATCH | `/entries/{id}/archive` | Archive (destructive — soft delete) |
| GET | `/revisions` | List revisions (filter by entryId) |
| GET | `/assets` | List assets in the media library |
| POST | `/assets` | Register an uploaded asset |
| POST | `/find-stale-content` | Orchestrator: published entries not updated in N days |
| POST | `/localize-entry` | Orchestrator: clone entry into a target-locale draft |
| POST | `/suggest-internal-links` | Orchestrator: keyword-overlap related entries |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_content_types` | tool | yes | List content types |
| `get_content_type` | tool | yes | Get a content type |
| `create_content_type` | tool | no | Define a new content type |
| `list_entries` | tool | yes | List entries with filters |
| `get_entry` | tool | yes | Get an entry by id |
| `create_entry` | tool | no | Create an entry (status=draft) |
| `update_entry` | tool | idempotent | Patch entry fields |
| `publish_entry` | tool | idempotent | Promote draft → published |
| `unpublish_entry` | tool | idempotent | Demote published → draft |
| `archive_entry` | tool | destructive | Soft-archive an entry |
| `list_revisions` | tool | yes | List revisions for an entry |
| `list_assets` | tool | yes | List media assets |
| `upload_asset` | tool | no | Register an uploaded asset |
| `find_stale_content` | tool | yes | Audit stale published content (orchestrator) |
| `localize_entry` | tool | no | Fork a draft into a target locale (orchestrator) |
| `suggest_internal_links` | tool | yes | Suggest related entries by keyword overlap (orchestrator) |

## The AI angle

Editorial teams spend most of their time on three things: keeping evergreen content fresh, shipping multiple locales, and threading related links across the site. The three orchestrators in this kit — `find_stale_content`, `localize_entry`, and `suggest_internal_links` — turn each of those chores into a single MCP call that an editor or copilot can fire off without clicking through dashboards. Every orchestrator stays inside the gateway and uses `context.invokeRoute()` so it inherits the same auth, rate-limit, and tenant scoping as the public REST API.

## Extending

- **Webhook on publish:** add an outbound webhook policy on `/entries/{id}/publish` to invalidate caches or kick a static-site rebuild.
- **Real revision capture:** snapshot every body/fields edit by writing a Revision row from `update-entry.ts`.
- **Smarter linking:** swap the keyword-overlap heuristic in `suggest-internal-links.ts` for a vector store (pgvector + Neon, for example).
- **Custom content-type validation:** add a domain rule in `modules/domain/` and call it from `create-entry.ts` to enforce required fields per content type.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

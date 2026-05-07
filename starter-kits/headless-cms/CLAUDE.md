# Headless CMS Starter Kit

Headless CMS API for marketing sites and apps. Replaces Contentful, Sanity, and headless WordPress. See [../CLAUDE.md](../CLAUDE.md) for the conventions every kit follows.

## Domain

| Entity | Purpose |
|---|---|
| `Entry` | A localised content row of a given content type. Primary entity. |
| `ContentType` | Schema definition entries conform to. |
| `Asset` | Media uploaded for use in entries. |
| `Revision` | Historical snapshot of an entry's body + fields. |
| `Author` | Person who edits content. |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/content-types` | List content types |
| POST | `/content-types` | Create a content type |
| GET | `/content-types/{id}` | Get a content type |
| GET | `/entries` | List entries (filter by contentTypeSlug, status, locale) |
| POST | `/entries` | Create entry (status=draft) |
| GET | `/entries/{id}` | Get entry |
| PATCH | `/entries/{id}` | Update entry |
| PATCH | `/entries/{id}/publish` | Publish |
| PATCH | `/entries/{id}/unpublish` | Back to draft |
| PATCH | `/entries/{id}/archive` | Archive (destructive) |
| GET | `/revisions` | List revisions |
| GET | `/assets` | List assets |
| POST | `/assets` | Register an asset |
| POST | `/find-stale-content` | Orchestrator |
| POST | `/localize-entry` | Orchestrator |
| POST | `/suggest-internal-links` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrators

- `find_stale_content` — list published entries with `updatedAt` older than N days, optionally filtered by contentTypeSlug. Calls `list_entries`.
- `localize_entry` — clone source entry into a new draft in `targetLocale`, slug suffixed with locale. Calls `get_entry` + `create_entry`.
- `suggest_internal_links` — extract keywords from source entry's title + excerpt, then scan published entries in the same content type for keyword overlap; rank top candidates. Calls `get_entry` + `list_entries`.

Both MCP layers must agree — the route-level `mcp` annotation and the `/mcp` route's `operations` array.

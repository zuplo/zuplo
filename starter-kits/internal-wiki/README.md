# Internal Wiki API

A Zuplo Starter Kit that ships a fully-tenanted internal wiki API together with an MCP server — agents can search docs, draft updates, find duplicates, and flag stale pages through plain HTTP or through MCP tools.

Replaces: Notion, Confluence, Slab.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/internal-wiki  # already done if you cloned the kit
cd starter-kits/internal-wiki
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
| GET | `/spaces` | List spaces |
| POST | `/spaces` | Create a space |
| GET | `/spaces/{id}` | Get a space |
| GET | `/pages` | List pages |
| GET | `/pages/search` | Substring search across title/body |
| POST | `/pages` | Create a page |
| GET | `/pages/{id}` | Get a page |
| PATCH | `/pages/{id}` | Update a page (writes a revision) |
| PATCH | `/pages/{id}/publish` | Publish a draft page |
| DELETE | `/pages/{id}/archive` | Archive a page |
| GET | `/pages/{id}/revisions` | List revisions |
| GET | `/pages/{id}/comments` | List comments |
| POST | `/pages/{id}/comments` | Add a comment |
| POST | `/permissions` | Upsert a permission row |
| POST | `/find-canonical-page-for-topic` | Orchestrator |
| POST | `/flag-outdated-pages` | Orchestrator |
| POST | `/merge-duplicate-pages` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_spaces` | tool | yes | List spaces |
| `get_space` | tool | yes | Get a space |
| `create_space` | tool | no | Create a space |
| `list_pages` | tool | yes | List pages |
| `get_page` | tool | yes | Get a page |
| `search_pages` | tool | yes | Substring search |
| `create_page` | tool | no | Create a page |
| `update_page` | tool | no | Update a page (writes a revision) |
| `publish_page` | tool | idempotent | Publish a page |
| `archive_page` | tool | destructive | Archive a page |
| `list_revisions` | tool | yes | List revisions |
| `list_comments` | tool | yes | List comments |
| `add_comment` | tool | no | Add a comment |
| `set_permission` | tool | idempotent | Upsert a permission |
| `find_canonical_page_for_topic` | tool | yes | Find the canonical page for a topic |
| `flag_outdated_pages` | tool | yes | Flag pages overdue for a refresh |
| `merge_duplicate_pages` | tool | yes | Propose a merge of duplicates |

## The AI angle

Three orchestrators turn the wiki from a document store into something an assistant can drive: `find_canonical_page_for_topic` answers "where's the doc on X?" with a ranked list rather than a guessed URL; `flag_outdated_pages` lets the assistant proactively surface stale content; and `merge_duplicate_pages` proposes a concrete merge plan when two pages overlap, leaving the destructive write as a separate tool call so a human or a confirmation-gated agent can apply it.

## Extending

- **Real search:** swap `search-pages.ts` for a Postgres `to_tsvector` query, an Algolia / Meilisearch call, or a vector store.
- **Publish webhooks:** add an outbound webhook policy on `publish_page` to ping Slack or email when a doc goes live.
- **Permissions enforcement:** the kit ships permission rows; production forks would consult them in handlers (look up `(spaceSlug, employeeEmail) -> role` and reject non-editors on update).
- **New endpoint:** create a handler in `modules/handlers/`, add the route in `routes.oas.json` with `mcp: { type: "tool" }`, and register the `operationId` in the `/mcp` route's `operations: [...]` array.
- **Switch databases:** change `DB_PROVIDER` in `.env`. The handler code never changes.

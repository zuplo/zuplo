# Community / Forum API

Topics, posts, members, and reactions with MCP tools that summarize unread for a user, find unanswered questions, and nominate helpful members.

**Replaces:** Discourse, Circle, Tribe.
**SEO target:** "api for community forum".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/community-forum
cd community-forum
cp env.example .env
npm install
npm run dev
```

The gateway boots at `http://localhost:9000`. To explore the MCP server:

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

## Choosing a database

This kit ships with HTTP-only adapters (the kits run in Zuplo's edge runtime — no TCP drivers). Set `DB_PROVIDER` in `.env` to one of:

| `DB_PROVIDER` | Adapter |
|---|---|
| `in-memory` | In-Memory (tests/local) |
| `supabase` | Supabase (PostgREST) |
| `firestore` | Firestore (REST) |
| `neon` | Neon (HTTP serverless) |
| `upstash-redis` | Upstash Redis (REST) |

`in-memory` is the default — the kit boots without any credentials so you can try it before wiring up storage.

## Environment variables

See [env.example](./env.example).

## API surface

| Method | Path | Operation ID | Description | MCP |
|---|---|---|---|---|
| GET | `/categories` | `list_categories` | List Categories | tool |
| POST | `/find-unanswered-questions` | `find_unanswered_questions` | Find Unanswered Questions | tool |
| GET | `/member/{id}` | `get_member` | Get Member | tool |
| GET | `/members` | `list_members` | List Members | tool |
| POST | `/nominate-helpful-members` | `nominate_helpful_members` | Nominate Helpful Members | tool |
| POST | `/post` | `create_post` | Create Post | tool |
| GET | `/posts` | `list_posts` | List Posts | tool |
| POST | `/react-to-post` | `react_to_post` | React To Post | tool |
| POST | `/report-post` | `report_post` | Report Post | tool |
| POST | `/summarize-unread-for-user` | `summarize_unread_for_user` | Summarize Unread For User | tool |
| POST | `/topic` | `create_topic` | Create Topic | tool |
| GET | `/topic/{id}` | `get_topic` | Get Topic | tool |
| POST | `/topic/{id}/close` | `close_topic` | Close Topic | tool |
| GET | `/topics` | `list_topics` | List Topics | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

14 tools registered: `close_topic`, `create_post`, `create_topic`, `get_member`, `get_topic`, `list_categories`, `list_members`, `list_posts`, `list_topics`, `react_to_post`, `report_post`, `find_unanswered_questions`, `nominate_helpful_members`, `summarize_unread_for_user`.

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

The orchestrator MCP tools shipped with this kit are where the agentic value compounds — they read multi-source signals through `context.invokeRoute()` and shape the response for an LLM, rather than dumping raw rows. Agents work best when they can call a few purposeful tools (`triage_x`, `summarize_x`, `flag_x`) instead of every CRUD endpoint.

Per the [conventions doc](../CLAUDE.md), every CRUD endpoint inherits `api-key-inbound` + `rate-limit` policies, and the `/mcp` route adds `prompt-injection-outbound` + `secret-masking-outbound` defenses for AI traffic.

## Extending

- **New entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **New endpoint:** add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **New orchestrator MCP tool:** drop a file in `modules/mcp-tools/` that uses `invokeJson` from `../_shared/mcp/helpers.ts` to compose existing endpoints. Pass the inbound `authorization` header through so the inner calls re-run policies.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.

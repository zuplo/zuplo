# Email Campaign API

Campaigns, subscribers, segments, and templates with MCP tools that summarize campaign performance, find at-risk subscribers, and propose send times.

**Replaces:** Mailchimp, Customer.io, ConvertKit.
**SEO target:** "api for email campaigns".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/email-campaign
cd email-campaign
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
| GET | `/campaigns` | `list_campaigns` | List campaigns | tool |
| POST | `/campaigns` | `create_campaign` | Create a draft campaign | tool |
| GET | `/campaigns/{id}` | `get_campaign` | Get a campaign by id | tool |
| PATCH | `/campaigns/{id}/cancel` | `cancel_campaign` | Cancel a campaign | tool |
| PATCH | `/campaigns/{id}/schedule` | `schedule_campaign` | Schedule a campaign for sending | tool |
| POST | `/find-at-risk-subscribers` | `find_at_risk_subscribers` | Find at-risk subscribers (orchestrator) | tool |
| POST | `/propose-send-time` | `propose_send_time` | Propose an optimal send time (orchestrator) | tool |
| GET | `/segments` | `list_segments` | List segments | tool |
| POST | `/segments` | `create_segment` | Create a segment | tool |
| GET | `/subscribers` | `list_subscribers` | List subscribers | tool |
| POST | `/subscribers` | `subscribe` | Subscribe a new contact | tool |
| PATCH | `/subscribers/{id}/unsubscribe` | `unsubscribe` | Unsubscribe a contact | tool |
| POST | `/summarize-campaign-performance` | `summarize_campaign_performance` | Summarize campaign performance (orchestrator) | tool |
| GET | `/suppressions` | `list_suppressions` | List suppressions | tool |
| POST | `/suppressions` | `add_suppression` | Add a suppression | tool |
| GET | `/templates` | `list_templates` | List email templates | tool |
| POST | `/templates` | `create_template` | Create an email template | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

17 tools registered: `list_campaigns`, `create_campaign`, `get_campaign`, `schedule_campaign`, `cancel_campaign`, `list_subscribers`, `subscribe`, `unsubscribe`, `list_segments`, `create_segment`, `list_templates`, `create_template`, `list_suppressions`, `add_suppression`, `summarize_campaign_performance`, `find_at_risk_subscribers`, `propose_send_time`.

Both layers of Zuplo's MCP wiring agree:
- Per-route `mcp: { type: "tool" }` annotations on each operation in `config/routes.oas.json`
- The `/mcp` route's `options.operations: [...]` array lists every `operationId` exposed

## The AI angle

The orchestrator MCP tools shipped with this kit are where the agentic value compounds — they read multi-source signals through `context.invokeRoute()` and shape the response for an LLM, rather than dumping raw rows. Agents work best when they can call a few purposeful tools (`triage_x`, `summarize_x`, `flag_x`) instead of every CRUD endpoint.

Per the [conventions doc](../CLAUDE.md), every CRUD endpoint inherits `api-key-inbound` + `rate-limit` policies, and the `/mcp` route adds `prompt-injection-outbound` + `secret-masking-outbound` defenses for AI traffic.

## Extending

- **New entity:** add a repository in `modules/repositories/` (follow the factory pattern keyed by `DB_PROVIDER`).
- **New endpoint:** add a handler in `modules/handlers/`, append the route to `config/routes.oas.json` with `mcp: { type: "tool" }`, and add the `operationId` to the `/mcp` route's `options.operations: [...]` array. Both layers must agree.
- **New orchestrator MCP tool:** drop a file in `modules/mcp-tools/` that uses `invokeJson` from `@zuplo/starter-kit-shared/mcp` to compose existing endpoints. Pass the inbound `authorization` header through so the inner calls re-run policies.
- **Switch databases:** change `DB_PROVIDER` in `.env` — the handlers don't change.

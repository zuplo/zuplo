# Lead Capture & Forms API

Forms, submissions, webhooks, and spam rules with MCP tools that score leads, route to owners, and flag spam patterns.

**Replaces:** Typeform, Formspree, HubSpot Forms.
**SEO target:** "form backend api".

## Quickstart

```bash
npx create-zuplo-api@latest --example starter-kits/lead-capture-forms
cd lead-capture-forms
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
| POST | `/flag-spam-pattern` | `flag_spam_pattern` | Propose a new spam rule from suspicious patterns (orchestrator) | tool |
| GET | `/forms` | `list_forms` | List forms | tool |
| POST | `/forms` | `create_form` | Create a form | tool |
| GET | `/forms/{id}` | `get_form` | Get a form by id | tool |
| POST | `/route-submission-to-owner` | `route_submission_to_owner` | Route a submission to an owner (orchestrator) | tool |
| POST | `/score-lead` | `score_lead` | Score a lead from a submission (orchestrator) | tool |
| GET | `/spam-rules` | `list_spam_rules` | List spam rules | tool |
| POST | `/spam-rules` | `create_spam_rule` | Create a spam rule | tool |
| GET | `/submissions` | `list_submissions` | List submissions | tool |
| POST | `/submissions` | `create_submission` | Submit a form | tool |
| GET | `/submissions/{id}` | `get_submission` | Get a submission by id | tool |
| PATCH | `/submissions/{id}/route` | `set_submission_owner` | Assign a submission to an owner | tool |
| GET | `/webhooks` | `list_webhooks` | List webhook subscriptions | tool |
| POST | `/webhooks` | `create_webhook` | Create a webhook subscription | tool |
| POST | `/mcp` | `mcp_handler` | MCP server endpoint | — |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

14 tools registered: `list_forms`, `create_form`, `get_form`, `list_submissions`, `create_submission`, `get_submission`, `set_submission_owner`, `list_webhooks`, `create_webhook`, `list_spam_rules`, `create_spam_rule`, `score_lead`, `route_submission_to_owner`, `flag_spam_pattern`.

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

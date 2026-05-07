# NPS / Customer Feedback API Starter Kit

A Zuplo Starter Kit for NPS, CSAT, and CES survey programs. Replaces Delighted, Wootric, and AskNicely.

## Quickstart

```bash
cd starter-kits/nps-feedback
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

See [env.example](./env.example).

The kit will boot with `DB_PROVIDER=in-memory` if no env vars are set, so the smoke test path is zero-config.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/surveys` | List surveys |
| POST | `/surveys` | Create survey |
| GET | `/surveys/{id}` | Get survey |
| POST | `/surveys/{id}/send` | Send survey to recipients (stub) |
| GET | `/responses` | List responses (filter by surveyId, category, customerEmail) |
| POST | `/responses` | Record a response |
| GET | `/responses/{id}` | Get a response |
| GET | `/follow-ups` | List follow-ups (filter by responseId, byEmail) |
| POST | `/follow-ups` | Log a follow-up |
| POST | `/cluster-open-responses` | Orchestrator: theme clustering |
| POST | `/flag-detractor-for-csm` | Orchestrator: unaddressed detractors |
| POST | `/compare-cohorts` | Orchestrator: NPS by segment |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Type | Read-only | Description |
|---|---|---|---|
| `list_surveys` | tool | yes | List surveys in tenant |
| `create_survey` | tool | no | Create survey |
| `get_survey` | tool | yes | Get survey |
| `send_survey` | tool | no | Queue a send batch (stub) |
| `list_responses` | tool | yes | List responses |
| `record_response` | tool | no | Record a response |
| `get_response` | tool | yes | Get a response |
| `list_followups` | tool | yes | List follow-ups |
| `log_followup` | tool | no | Log a follow-up |
| `cluster_open_responses` | tool | yes | Theme clustering orchestrator |
| `flag_detractor_for_csm` | tool | yes | Detractor tracker |
| `compare_cohorts` | tool | yes | Segment-vs-segment NPS comparison |

## The AI angle

The point of NPS isn't the score — it's responding to it. `flag_detractor_for_csm` keeps a queue of unaddressed detractors so an assistant can draft outreach. `cluster_open_responses` answers "what are people complaining about lately?" without anyone having to read the comment column. `compare_cohorts` is the analyst question — "are enterprise accounts happier than SMB?" — answered in one tool call.

## Extending

- **Real send backend:** replace `modules/handlers/send-survey.ts` with an SES, Postmark, or SendGrid call. The route stays the same.
- **Custom themes:** pass a `themes` array to `cluster_open_responses` for domain-specific keyword buckets, or replace the keyword match with an embedding-based similarity score.
- **New orchestrator:** add a handler in `modules/mcp-tools/`, list it on a route, register the operationId in the `/mcp` route's `operations` array.
- **Switch databases:** change `DB_PROVIDER` in `.env`.

# Survey & Poll API

Headless survey, poll, and quiz API backed by an MCP server. Define questions, collect responses, summarize results — and let an LLM cluster open-ended feedback, compare cohorts, and propose follow-up questions.

Replaces: SurveyMonkey, Polly, Slido.

## Quickstart

```bash
cp -r starter-kits/_template starter-kits/survey-poll
cd starter-kits/survey-poll
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
| GET | `/surveys` | List surveys |
| POST | `/surveys` | Create a survey |
| GET | `/surveys/{id}` | Get a survey |
| GET | `/surveys/{id}/questions` | List questions |
| POST | `/surveys/{id}/questions` | Add a question |
| PATCH | `/surveys/{id}/open` | Open survey for responses |
| PATCH | `/surveys/{id}/close` | Close a survey |
| GET | `/surveys/{id}/responses` | List responses |
| POST | `/surveys/{id}/results` | Summarize results |
| POST | `/responses` | Submit a response |
| GET | `/responses/{id}` | Get a response (with answers) |
| POST | `/cluster-open-responses` | Orchestrator: cluster text answers |
| POST | `/compare-cohorts` | Orchestrator: cohort distribution diff |
| POST | `/propose-followup-question` | Orchestrator: suggest a follow-up |
| POST | `/mcp` | MCP server endpoint |

OpenAPI: [`config/routes.oas.json`](./config/routes.oas.json).

## MCP tools

| Tool | Read-only | Description |
|---|---|---|
| `list_surveys` | yes | List surveys |
| `get_survey` | yes | Get a survey by id |
| `create_survey` | no | Create a draft survey |
| `list_questions` | yes | List questions on a survey |
| `add_question` | no | Append a question |
| `open_survey` | no (idempotent) | Move draft → open |
| `close_survey` | no (idempotent) | Move open → closed |
| `list_responses` | yes | List responses on a survey |
| `submit_response` | no | Submit a response with answers |
| `get_response` | yes | Get a response and its answers |
| `summarize_results` | yes | Counts and answer distributions |
| `cluster_open_responses` | yes | Top theme keywords with samples |
| `compare_cohorts` | yes | Distribution diff across cohorts |
| `propose_followup_question` | yes | Suggested follow-up prompt |

## The AI angle

`cluster_open_responses` is the headline. Instead of teaching an agent to fetch every response, parse text, count word frequencies, and pick samples, it gets one tool that returns ranked themes with examples. Pair with `propose_followup_question` to draft a sharper follow-up survey, and `compare_cohorts` to see which segments care about each theme.

## Extending

- **Branching logic**: add a `next` field on `Question` and have `submit_response` skip questions that don't apply.
- **Quiz scoring**: add a `correctAnswer` on `Question` and a server-side scoring step in `submit_response`.
- **Smarter clustering**: swap the keyword tally in `cluster_open_responses` for an embedding-based approach.
- **Switch databases**: change `DB_PROVIDER`. Handler code never changes.

# Survey & Poll Starter Kit

Headless survey/poll/quiz — surveys hold questions, responses hold answers, orchestrators slice the data. See [../CLAUDE.md](../CLAUDE.md) for kit conventions.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/surveys` | List surveys |
| POST | `/surveys` | Create a draft survey |
| GET | `/surveys/{id}` | Get a survey |
| GET | `/surveys/{id}/questions` | List questions |
| POST | `/surveys/{id}/questions` | Add a question |
| PATCH | `/surveys/{id}/open` | Open survey |
| PATCH | `/surveys/{id}/close` | Close survey |
| GET | `/surveys/{id}/responses` | List responses |
| POST | `/surveys/{id}/results` | Summarize results |
| POST | `/responses` | Submit a response |
| GET | `/responses/{id}` | Get a response |
| POST | `/cluster-open-responses` | Orchestrator: cluster text answers |
| POST | `/compare-cohorts` | Orchestrator: cohort comparison |
| POST | `/propose-followup-question` | Orchestrator: suggest follow-up |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Survey` — primary, holds metadata + status
- `Question` — one prompt on a survey
- `Response` — one respondent's submission
- `Answer` — one answer on a response (value shape varies by question kind)
- `Cohort` — named subset of respondents (used by `compare_cohorts`)

## MCP tools registered

`list_surveys`, `get_survey`, `create_survey`, `list_questions`, `add_question`, `open_survey`, `close_survey`, `list_responses`, `submit_response`, `get_response`, `summarize_results`, `cluster_open_responses`, `compare_cohorts`, `propose_followup_question`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).

# NPS / Customer Feedback API

Surveys, responses, and follow-ups with MCP tools that cluster open responses, flag detractors for CSM, and compare cohorts.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/cluster-open-responses` | `cluster_open_responses` | tool |
| POST | `/compare-cohorts` | `compare_cohorts` | tool |
| POST | `/flag-detractor-for-csm` | `flag_detractor_for_csm` | tool |
| GET | `/follow-ups` | `list_followups` | tool |
| POST | `/follow-ups` | `log_followup` | tool |
| GET | `/responses` | `list_responses` | tool |
| POST | `/responses` | `record_response` | tool |
| GET | `/responses/{id}` | `get_response` | tool |
| GET | `/surveys` | `list_surveys` | tool |
| POST | `/surveys` | `create_survey` | tool |
| GET | `/surveys/{id}` | `get_survey` | tool |
| POST | `/surveys/{id}/send` | `send_survey` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

12 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `list_surveys`
- `create_survey`
- `get_survey`
- `send_survey`
- `list_responses`
- `record_response`
- `get_response`
- `list_followups`
- `log_followup`
- `cluster_open_responses`
- `flag_detractor_for_csm`
- `compare_cohorts`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 12 entries above.

## Replaces

- Delighted
- Wootric
- AskNicely

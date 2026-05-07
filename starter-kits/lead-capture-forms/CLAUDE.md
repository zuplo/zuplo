# Lead Capture & Forms API

Forms, submissions, webhooks, and spam rules with MCP tools that score leads, route to owners, and flag spam patterns.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/flag-spam-pattern` | `flag_spam_pattern` | tool |
| GET | `/forms` | `list_forms` | tool |
| POST | `/forms` | `create_form` | tool |
| GET | `/forms/{id}` | `get_form` | tool |
| POST | `/route-submission-to-owner` | `route_submission_to_owner` | tool |
| POST | `/score-lead` | `score_lead` | tool |
| GET | `/spam-rules` | `list_spam_rules` | tool |
| POST | `/spam-rules` | `create_spam_rule` | tool |
| GET | `/submissions` | `list_submissions` | tool |
| POST | `/submissions` | `create_submission` | tool |
| GET | `/submissions/{id}` | `get_submission` | tool |
| PATCH | `/submissions/{id}/route` | `set_submission_owner` | tool |
| GET | `/webhooks` | `list_webhooks` | tool |
| POST | `/webhooks` | `create_webhook` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

14 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `list_forms`
- `create_form`
- `get_form`
- `list_submissions`
- `create_submission`
- `get_submission`
- `set_submission_owner`
- `list_webhooks`
- `create_webhook`
- `list_spam_rules`
- `create_spam_rule`
- `score_lead`
- `route_submission_to_owner`
- `flag_spam_pattern`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 14 entries above.

## Replaces

- Typeform
- Formspree
- HubSpot Forms

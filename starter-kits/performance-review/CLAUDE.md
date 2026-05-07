# Performance Review & 360 API

Review cycles, goals, and 360 feedback with MCP tools to request peer feedback, summarize themes, and track goal progress.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| POST | `/cycle` | `create_cycle` | tool |
| GET | `/cycles` | `list_cycles` | tool |
| POST | `/goal` | `create_goal` | tool |
| PATCH | `/goal-progress/{id}` | `update_goal_progress` | tool |
| GET | `/goals` | `list_goals` | tool |
| POST | `/request-peer-feedback` | `request_peer_feedback` | tool |
| POST | `/review` | `create_review` | tool |
| GET | `/review/{id}` | `get_review` | tool |
| POST | `/review/{id}/submit` | `submit_review` | tool |
| GET | `/reviews` | `list_reviews` | tool |
| POST | `/summarize-feedback-themes` | `summarize_feedback_themes` | tool |
| POST | `/track-goal-progress` | `track_goal_progress` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

12 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `create_cycle`
- `create_goal`
- `create_review`
- `get_review`
- `list_cycles`
- `list_goals`
- `list_reviews`
- `submit_review`
- `update_goal_progress`
- `request_peer_feedback`
- `summarize_feedback_themes`
- `track_goal_progress`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 12 entries above.

## Replaces

- Lattice
- 15Five
- Culture Amp

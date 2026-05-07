# Community / Forum API

Topics, posts, members, and reactions with MCP tools that summarize unread for a user, find unanswered questions, and nominate helpful members.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| GET | `/categories` | `list_categories` | tool |
| POST | `/find-unanswered-questions` | `find_unanswered_questions` | tool |
| GET | `/member/{id}` | `get_member` | tool |
| GET | `/members` | `list_members` | tool |
| POST | `/nominate-helpful-members` | `nominate_helpful_members` | tool |
| POST | `/post` | `create_post` | tool |
| GET | `/posts` | `list_posts` | tool |
| POST | `/react-to-post` | `react_to_post` | tool |
| POST | `/report-post` | `report_post` | tool |
| POST | `/summarize-unread-for-user` | `summarize_unread_for_user` | tool |
| POST | `/topic` | `create_topic` | tool |
| GET | `/topic/{id}` | `get_topic` | tool |
| POST | `/topic/{id}/close` | `close_topic` | tool |
| GET | `/topics` | `list_topics` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

14 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `close_topic`
- `create_post`
- `create_topic`
- `get_member`
- `get_topic`
- `list_categories`
- `list_members`
- `list_posts`
- `list_topics`
- `react_to_post`
- `report_post`
- `find_unanswered_questions`
- `nominate_helpful_members`
- `summarize_unread_for_user`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 14 entries above.

## Replaces

- Discourse
- Circle
- Tribe

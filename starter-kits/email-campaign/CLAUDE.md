# Email Campaign API

Campaigns, subscribers, segments, and templates with MCP tools that summarize campaign performance, find at-risk subscribers, and propose send times.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| GET | `/campaigns` | `list_campaigns` | tool |
| POST | `/campaigns` | `create_campaign` | tool |
| GET | `/campaigns/{id}` | `get_campaign` | tool |
| PATCH | `/campaigns/{id}/cancel` | `cancel_campaign` | tool |
| PATCH | `/campaigns/{id}/schedule` | `schedule_campaign` | tool |
| POST | `/find-at-risk-subscribers` | `find_at_risk_subscribers` | tool |
| POST | `/propose-send-time` | `propose_send_time` | tool |
| GET | `/segments` | `list_segments` | tool |
| POST | `/segments` | `create_segment` | tool |
| GET | `/subscribers` | `list_subscribers` | tool |
| POST | `/subscribers` | `subscribe` | tool |
| PATCH | `/subscribers/{id}/unsubscribe` | `unsubscribe` | tool |
| POST | `/summarize-campaign-performance` | `summarize_campaign_performance` | tool |
| GET | `/suppressions` | `list_suppressions` | tool |
| POST | `/suppressions` | `add_suppression` | tool |
| GET | `/templates` | `list_templates` | tool |
| POST | `/templates` | `create_template` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

17 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `list_campaigns`
- `create_campaign`
- `get_campaign`
- `schedule_campaign`
- `cancel_campaign`
- `list_subscribers`
- `subscribe`
- `unsubscribe`
- `list_segments`
- `create_segment`
- `list_templates`
- `create_template`
- `list_suppressions`
- `add_suppression`
- `summarize_campaign_performance`
- `find_at_risk_subscribers`
- `propose_send_time`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 17 entries above.

## Replaces

- Mailchimp
- Customer.io
- ConvertKit

# MCP Server Prompts

An example MCP Server with additional MCP Prompts to enhance the end user experience.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/bookmarks.ts` | Custom module |
| `modules/research-roundup-prompt.ts` | Custom module |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/bookmarks` | List saved bookmarks |
| POST | `/bookmarks` | Save a new bookmark |
| DELETE | `/bookmarks/{id}` | Delete a bookmark |
| POST | `/prompts/research-roundup` | Summarize recent research based on saved bookmarks |
| POST | `/mcp` | mcp-handler |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example mcp-server-prompts
```

**Run locally:**
```bash
npm install
npm run dev
# Server runs on https://localhost:9000
```

**Deploy to Zuplo:**
```bash
zuplo deploy
```
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/mcp-server-prompts) button.

## Test Commands

```bash
# List saved bookmarks
curl http://localhost:9000/bookmarks

# Save a new bookmark
curl -X POST http://localhost:9000/bookmarks \
  -H "Content-Type: application/json" \
  -d '{}'

```

## Policies Used

- **mock-api-inbound** (Built-in): mock-api-inbound

## Environment Variables

Set these in `.env` locally or in Zuplo Portal > Settings > Environment Variables:

- `EXAMPLE_SECRET`
- `EXAMPLE_CONFIG`

## Related Docs

- [MCP Server Documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

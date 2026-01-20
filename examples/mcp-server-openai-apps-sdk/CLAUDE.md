# OpenAI App

Example ChatGPT App using an MCP Server and the OpenAI Apps SDK.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/github-stats.ts` | Custom module |
| `modules/widget-resource.ts` | Custom module |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mcp/resources/widget/github-stats` | GitHub Stats Widget UI Template |
| POST | `/github-stats` | Retrieve and visualize GitHub profile statistics for any user |
| POST | `/mcp` | MCP Server |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example mcp-server-openai-apps-sdk
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/mcp-server-openai-apps-sdk) button.

## Test Commands

```bash
# GitHub Stats Widget UI Template
curl http://localhost:9000/mcp/resources/widget/github-stats

# Retrieve and visualize GitHub profile statistics for any user
curl -X POST http://localhost:9000/github-stats \
  -H "Content-Type: application/json" \
  -d '{}'

# MCP Server
curl -X POST http://localhost:9000/mcp \
  -H "Content-Type: application/json" \
  -d '{}'

```

## Policies Used

- **anything-goes** (Built-in): cors-inbound-policy

## Environment Variables

Set these in `.env` locally or in Zuplo Portal > Settings > Environment Variables:

- `GITHUB_USERNAME`
- `GITHUB_TOKEN`

## Related Docs

- [MCP Server Documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

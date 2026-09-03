# GraphQL MCP Server

Exposing GraphQL APIs as an MCP Server with built-in introspection.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/graphql` | GraphQL |
| POST | `/mcp` | MCP Server |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example mcp-server-graphql
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/mcp-server-graphql) button.

## Test Commands

```bash
# GraphQL
curl -X POST https://localhost:9000/graphql \
  -H "Content-Type: application/json" \
  -d '{}'

# MCP Server
curl -X POST https://localhost:9000/mcp \
  -H "Content-Type: application/json" \
  -d '{}'

```

## Policies Used

- **api-key-inbound** (Built-in): api-key-inbound

## Environment Variables

None required. This example proxies a public GraphQL API and only reads the built-in `api-key-inbound` policy configuration.

## Related Docs

- [MCP Server Documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

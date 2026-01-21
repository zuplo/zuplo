# Remote MCP Server with OAuth

A remote MCP Server that shows how to setup OAuth authentication with Auth0

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/zuplo.runtime.ts` | Custom module |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/todos` | Get all todos |
| POST | `/todos` | Create a new todo |
| PUT | `/todos/{id}` | Update a todo |
| DELETE | `/todos/{id}` | Delete a todo |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example remote-mcp-server-with-oauth
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/remote-mcp-server-with-oauth) button.

## Test Commands

```bash
# Get all todos
curl http://localhost:9000/todos

# Create a new todo
curl -X POST http://localhost:9000/todos \
  -H "Content-Type: application/json" \
  -d '{}'

```

## Policies Used

- **mock-api-inbound** (Built-in): mock-api-inbound
- **auth0-jwt-auth-inbound** (Built-in): auth0-jwt-auth-inbound

## Environment Variables

Set these in `.env` locally or in Zuplo Portal > Settings > Environment Variables:

- `EXAMPLE_SECRET`
- `EXAMPLE_CONFIG`

## Related Docs

- [MCP Server Documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

# Remote MCP Server

Create a remote MCP server for an API with authentication and additional security policies.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/hello-world.ts` | Custom module |
| `modules/transform-body-outbound.ts` | Outbound policy |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/todos` | Get all todos |
| POST | `/v1/todos` | Create Todo |
| DELETE | `/v1/todos/{todoId}` | Delete Todo |
| PATCH | `/v1/todos/{todoId}` | Update Todo |
| GET | `/v1/todos/{todoId}` | Get todo by ID |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example remote-mcp-server
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/remote-mcp-server) button.

## Test Commands

```bash
# Get all todos
curl http://localhost:9000/v1/todos

# Create Todo
curl -X POST http://localhost:9000/v1/todos \
  -H "Content-Type: application/json" \
  -d '{}'

```

## Policies Used

- **api-key-inbound** (Built-in): api-key-inbound
- **custom-code-outbound** (Custom): custom-code-outbound
- **secret-masking-outbound** (Built-in): secret-masking-outbound
- **prompt-injection-outbound** (Built-in): prompt-injection-outbound
- **query-param-to-header-inbound** (Built-in): query-param-to-header-inbound

## Environment Variables

Set these in `.env` locally or in Zuplo Portal > Settings > Environment Variables:

- `OPENAI_API_KEY`

## Related Docs

- [MCP Server Documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

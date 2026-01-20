# API Linting

See how to use API linting to enforce api consistency and require Zuplo features like policies.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/remove-user-id.ts` | Custom module |
| `modules/todos-and-users.ts` | Custom module |
| `modules/types.ts` | Custom module |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/todos` | Get all todos |
| POST | `/v1/todos` | Create Todo |
| GET | `/v1/todos-and-users` | Get todos with user information |
| PATCH | `/v1/todos/{todoId}` | Update Todo |
| DELETE | `/v1/todos/{todoId}` | Delete Todo |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example api-linting
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/api-linting) button.

## Test Commands

```bash
# Get all todos
curl http://localhost:9000/v1/todos

# Create Todo
curl -X POST http://localhost:9000/v1/todos \
  -H "Content-Type: application/json" \
  -d '{}'

# Get todos with user information
curl http://localhost:9000/v1/todos-and-users

```

## Policies Used

- **validate-json-schema-inbound** (Built-in): validate-json-schema-inbound
- **validate-json-schema-inbound-1** (Built-in): validate-json-schema-inbound
- **custom-code-outbound** (Custom): custom-code-outbound

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

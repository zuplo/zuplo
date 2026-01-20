# Dev Portal with API Keys

An example of a Zuplo Dev Portal with support for self-serve API key creation.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/api-keys.ts` | Custom module |
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
npx create-zuplo-api@latest --example dev-portal-with-api-keys
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/dev-portal-with-api-keys) button.

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
- **open-id-jwt-auth-inbound** (Built-in): open-id-jwt-auth-inbound
- **api-key-inbound** (Built-in): api-key-inbound

## Environment Variables

Set these in `.env` locally or in Zuplo Portal > Settings > Environment Variables:

- `ZP_DEVELOPER_API_KEY`
- `ZP_ACCOUNT_NAME`
- `ZP_API_KEY_SERVICE_BUCKET_NAME`

## Related Docs

- [Authentication Policies](https://zuplo.com/docs/policies#authentication)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

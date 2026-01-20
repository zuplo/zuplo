# Schema Validation with File Refs

Use the Request Validation policy with OpenAPI that references external files.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/remove-user-id.ts` | Custom module |
| `modules/todos-and-users.ts` | Custom module |
| `modules/types.ts` | Custom module |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/todos` | Create Todo |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example schema-validation-file-ref
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/schema-validation-file-ref) button.

## Test Commands

```bash
# Create Todo
curl -X POST http://localhost:9000/v1/todos \
  -H "Content-Type: application/json" \
  -d '{}'

```

## Policies Used

- **remove-user-id** (Custom): custom-code-outbound
- **request-validation-inbound** (Built-in): request-validation-inbound
- **set-content-type** (Built-in): set-headers-inbound

## Environment Variables

None required for this example.

## Related Docs

- [Request Validation](https://zuplo.com/docs/policies/request-validation-inbound)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

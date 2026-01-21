# Rewrite Request Body

Use a custom policy to rewrite the body of a Request

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/rewrite-body.ts` | Custom module |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rewrite-body` |  |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example rewrite-request-body
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/rewrite-request-body) button.

## Test Commands

```bash
# /rewrite-body
curl -X POST http://localhost:9000/rewrite-body \
  -H "Content-Type: application/json" \
  -d '{}'

```

## Policies Used

- **rewrite-body** (Custom): custom-code-inbound

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

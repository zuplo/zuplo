# Route Custom Data

Use custom data from OpenAPI documents in policies and handlers.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `modules/echo.ts` | Custom module |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/custom-data` |  |
| GET | `/custom-flag` |  |
| GET | `/internal-route` |  |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example route-custom-data
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/route-custom-data) button.

## Test Commands

```bash
# /custom-data
curl http://localhost:9000/custom-data

# /custom-flag
curl http://localhost:9000/custom-flag

# /internal-route
curl http://localhost:9000/internal-route

```

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

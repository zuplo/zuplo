# Custom Rate Limiting

Invoke the Rate Limit policy programatically and then modify the 429 response.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/rate-limiting.ts` | Rate limit configuration |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/test` | Test |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example custom-429-response
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/custom-429-response) button.

## Test Commands

```bash
# Test
curl http://localhost:9000/test

```

## Policies Used

- **custom-rate-limit-inbound** (Custom): custom-code-inbound
- **rate-limit-inbound** (Built-in): rate-limit-inbound

## Environment Variables

None required for this example.

## Related Docs

- [Rate Limiting Policy](https://zuplo.com/docs/policies/rate-limit-inbound)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

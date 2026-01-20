# Upstream Jwt Auth

This example demonstrates how to use the Zuplo [JWT Service Plugin](https://zuplo.com/docs/programmable-api/jwt-service-plugin) to authenticate requests to an upstream (backend) service using a JWT token.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/add-auth-header.ts` | Custom module |
| `modules/zuplo.runtime.ts` | Custom module |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/test` | Test |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example upstream-jwt-auth
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/upstream-jwt-auth) button.

## Test Commands

```bash
# Test
curl http://localhost:9000/test

```

## Policies Used

- **add-auth-header** (Custom): custom-code-inbound

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

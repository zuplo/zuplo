# OpenFGA Authorization

Use OpenFGA from a custom policy to authorize access to a resource.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/authorization.ts` | Custom module |
| `modules/openfga.ts` | Custom module |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/docs/{id}` |  |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example openfga
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/openfga) button.

## Test Commands

```bash
# /docs/{id}
curl http://localhost:9000/docs/{id}

```

## Policies Used

- **auth0-jwt-auth-inbound** (Built-in): auth0-jwt-auth-inbound
- **authorization** (Custom): custom-code-inbound

## Environment Variables

None required for this example.

## Related Docs

- [Authentication Policies](https://zuplo.com/docs/policies#authentication)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

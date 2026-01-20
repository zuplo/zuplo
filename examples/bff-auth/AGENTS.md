# Backend for Frontend (BFF) Auth

Optimize UX and security in web applications with this approach.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `modules/bff.ts` | Custom module |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/app` | Fake App |
| GET | `/auth/callback` | Auth Callback |
| GET | `/auth/login` | Auth Login |
| GET | `/auth/logout` | Auth Logout |
| GET | `/auth/bff-token` | BFF Token |
| GET | `/auth/bff-sessioninfo` | BFF Session Info |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example bff-auth
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/bff-auth) button.

## Test Commands

```bash
# Fake App
curl http://localhost:9000/app

# Auth Callback
curl http://localhost:9000/auth/callback

# Auth Login
curl http://localhost:9000/auth/login

```

## Environment Variables

None required for this example.

## Related Docs

- [Authentication Policies](https://zuplo.com/docs/policies#authentication)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

# Proxy Firestore User

This sample demonstrates how to expose Firestore documents through a REST API using the Zuplo [URL Rewrite Handler](https://zuplo.com/docs/handlers/url-rewrite) and the [Firebase User Auth Policy](https://zuplo.com/docs/policies/upstream-firebase-user-auth-inbound).

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/set-user.ts` | Custom module |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/todos/{name}` | 51985ae4-9cf9-4fbd-a617-ecb4e648b8f1 |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example proxy-firestore-user
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/proxy-firestore-user) button.

## Test Commands

```bash
# 51985ae4-9cf9-4fbd-a617-ecb4e648b8f1
curl -X POST http://localhost:9000/todos/{name} \
  -H "Content-Type: application/json" \
  -d '{}'

```

## Policies Used

- **set-user** (Custom): custom-code-inbound
- **firebase-user-auth** (Built-in): upstream-firebase-user-auth-inbound

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

# Proxy Firestore Admin

This sample demonstrates how to expose Firestore documents through a REST API using the Zuplo [URL Rewrite Handler](https://zuplo.com/docs/handlers/url-rewrite) and the [Firebase Admin Auth Policy](https://zuplo.com/docs/policies/upstream-firebase-admin-auth-inbound).

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/doc/{id}` | Proxy Firebase Document |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example proxy-firestore-admin
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/proxy-firestore-admin) button.

## Test Commands

```bash
# Proxy Firebase Document
curl http://localhost:9000/doc/{id}

```

## Policies Used

- **upstream-firebase-admin** (Built-in): upstream-firebase-admin-auth-inbound

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

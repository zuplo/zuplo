# Ab Test Backend

This sample demonstrates how to send some amount of traffic to a different API backend and have the version of the backend be sticky for a particular user.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/ab-test.ts` | Custom module |
| `modules/fake-auth.ts` | Custom module |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/test` | Test |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example ab-test-backend
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/ab-test-backend) button.

## Test Commands

```bash
# Test
curl http://localhost:9000/test

```

## Policies Used

- **ab-test** (Custom): custom-code-inbound
- **fake-auth** (Custom): custom-code-inbound

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

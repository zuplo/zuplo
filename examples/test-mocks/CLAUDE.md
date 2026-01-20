# Mocking & Unit Test

Create unit tests by mocking Zuplo objects.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `modules/handler1.ts` | Request handler |
| `modules/handler2.ts` | Request handler |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/handler1` | Handler 1 |
| GET | `/handler2/:param1` | Handler 2 |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example test-mocks
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/test-mocks) button.

## Test Commands

```bash
# Handler 1
curl http://localhost:9000/handler1

# Handler 2
curl http://localhost:9000/handler2/:param1

```

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

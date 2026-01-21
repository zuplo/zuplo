# Log Request & Response

Capture the full request and response to send to your log provider.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `modules/hello-world.ts` | Custom module |
| `modules/zuplo.runtime.ts` | Custom module |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/test` | 2042d944-cb5f-4979-9a61-4f28fd535e64 |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example log-request-response
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/log-request-response) button.

## Test Commands

```bash
# 2042d944-cb5f-4979-9a61-4f28fd535e64
curl http://localhost:9000/test

```

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

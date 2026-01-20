# Custom Modules

How to bundle custom node modules to use in your Zuplo project.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `modules/hello.ts` | Custom module |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/hello-module` |  |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example custom-module
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/custom-module) button.

## Test Commands

```bash
# /hello-module
curl http://localhost:9000/hello-module

```

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

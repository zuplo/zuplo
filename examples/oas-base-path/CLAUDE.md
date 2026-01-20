# Custom Base Path

Demonstrates how to store base path and backend server configuration in the OpenAPI `servers` object and use a policy to dynamically remove the base path and route requests to the correct backend.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes1.oas.json` | First OpenAPI route file with server config |
| `config/routes2.oas.json` | Second OpenAPI route file with different server |
| `config/policies.json` | Policy configurations |
| `modules/server-lookup.ts` | Policy that reads x-base-path and sets forwarding URL |

## How It Works

1. Each OpenAPI file defines routes under a different base path with `x-base-path` extension
2. The `server-lookup` policy reads the request path and matches it to the server config
3. The policy removes the base path and sets the forwarded URL to the correct backend

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example oas-base-path
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/oas-base-path) button.

## Test Commands

```bash
# Request with base path /my-base-1 (routes to first backend)
curl http://localhost:9000/my-base-1/hello

# Request with base path /my-base-2 (routes to second backend)
curl http://localhost:9000/my-base-2/hello
```

## OpenAPI Server Configuration

The `x-base-path` custom extension maps base paths to backend servers:

```json
{
  "servers": [
    {
      "url": "https://echo.zuplo.io",
      "x-base-path": "/my-base-1"
    }
  ]
}
```

## Common Tasks

- **Add new base path**: Create a new routes file with its own `x-base-path` server config
- **Change backend URL**: Update the `url` in the servers array
- **Import efficiently**: Only import `{ servers }` from OpenAPI files to avoid bloating the build

## Environment Variables

None required for this example.

## Related Docs

- [OpenAPI Extensions](https://zuplo.com/docs/articles/open-api)
- [Custom Policies](https://zuplo.com/docs/policies/custom-code-inbound)
- [Zuplo Documentation](https://zuplo.com/docs)

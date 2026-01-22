# GitHub Copilot Instructions - Zuplo Basic API Gateway

This is a Zuplo API Gateway project demonstrating authentication, rate limiting, request validation, and request size limits. The gateway proxies requests to a backend Todo API.

## Project Structure

```
basic-api-gateway/
├── config/
│   ├── routes.oas.json    # OpenAPI 3.1 spec with x-zuplo-route extensions
│   └── policies.json      # Policy configurations
├── modules/               # Custom TypeScript handlers
├── docs/                  # Developer portal (Zudoku)
├── package.json
└── zuplo.jsonc
```

## How Zuplo Works

### Routes (`config/routes.oas.json`)
Routes are defined in OpenAPI format with `x-zuplo-route` extensions:

```json
{
  "paths": {
    "/endpoint": {
      "get": {
        "x-zuplo-route": {
          "handler": {
            "export": "urlForwardHandler",
            "module": "$import(@zuplo/runtime)",
            "options": { "baseUrl": "https://api.example.com" }
          },
          "policies": {
            "inbound": ["policy-name-1", "policy-name-2"]
          }
        }
      }
    }
  }
}
```

### Policies (`config/policies.json`)
This project uses these policies:
- `api-key-inbound` - API key authentication
- `rate-limit-inbound` - Rate limiting (2 req/min per user)
- `request-validation-inbound` - JSON schema validation
- `request-size-limit-inbound` - Max 1000 bytes

### Custom Handlers (`modules/*.ts`)
```typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  context.log.info("Processing request");
  return new Response(JSON.stringify({ message: "Hello" }), {
    headers: { "content-type": "application/json" }
  });
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/todos` | Get all todos |
| POST | `/todos` | Create todo (body: `title`, `userId` required) |
| PUT | `/todos/{id}` | Update todo |
| DELETE | `/todos/{id}` | Delete todo |

## Development Commands

```bash
npm install    # Install dependencies
npm run dev    # Local server at http://localhost:9000
npm run test   # Run tests
zuplo deploy   # Deploy to Zuplo
```

## Code Patterns

### When creating handlers:
- Import `ZuploContext` and `ZuploRequest` from `@zuplo/runtime`
- Export a default async function
- Return a `Response` object
- Use `context.log` for logging

### When adding routes:
- Follow OpenAPI 3.1 specification
- Add `x-zuplo-route` with handler and policies
- Define schemas in `components/schemas` for validation

### When adding policies:
- Add configuration to `policies.json`
- Reference by name in route's `policies.inbound` array
- Policies execute in array order

## Testing

Local dev bypasses API key validation:
```bash
curl http://localhost:9000/todos -H "Authorization: Bearer test-key"
```

# Basic API Gateway - AI Agent Instructions

This is a Zuplo API Gateway example that demonstrates authentication, rate limiting, request validation, and request size limits.

## Project Overview

This project is a production-ready API gateway that proxies requests to a backend Todo API (`https://todo.zuplo.io`) while applying security and control policies.

## Project Structure

```
basic-api-gateway/
├── config/
│   ├── routes.oas.json    # OpenAPI spec with route definitions and policies
│   └── policies.json      # Policy configuration (rate limits, auth, etc.)
├── modules/
│   └── hello-world.ts     # Example custom handler
├── docs/                  # Developer portal configuration (Zudoku)
├── package.json           # Dependencies (zuplo package)
├── zuplo.jsonc            # Zuplo project metadata
└── env.example            # Example environment variables
```

## Key Files

### `config/routes.oas.json`
- OpenAPI 3.1 specification defining all API routes
- Uses `x-zuplo-route` extension for Zuplo-specific configuration
- Defines handlers and policies for each route
- Contains JSON schemas for request validation in `components/schemas`

### `config/policies.json`
- Configures all policies used by routes
- Policies: `api-key-inbound`, `rate-limit-inbound`, `request-validation-inbound`, `request-size-limit-inbound`
- Each policy has a `name`, `policyType`, and `handler` with options

### `modules/*.ts`
- Custom TypeScript handlers and policies
- Handlers receive `ZuploRequest` and `ZuploContext`, return `Response`
- Import from `@zuplo/runtime`

## API Endpoints

| Method | Path | Description | Policies |
|--------|------|-------------|----------|
| GET | `/todos` | Get all todos | api-key, rate-limit |
| POST | `/todos` | Create todo | api-key, rate-limit, validation, size-limit |
| PUT | `/todos/{id}` | Update todo | api-key, rate-limit, validation, size-limit |
| DELETE | `/todos/{id}` | Delete todo | api-key, rate-limit |

## Common Tasks

### Adding a New Route
1. Add path and operation to `config/routes.oas.json`
2. Include `x-zuplo-route` with handler and policies
3. Add request/response schemas to `components/schemas` if needed

### Creating a Custom Handler
```typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  return new Response(JSON.stringify({ message: "Hello" }), {
    headers: { "content-type": "application/json" }
  });
}
```

### Adding a New Policy
1. Add policy configuration to `config/policies.json`
2. Reference policy name in route's `policies.inbound` array in `routes.oas.json`

### Modifying Policy Settings
Edit `config/policies.json`. Key options:
- **Rate Limit**: `rateLimitBy`, `requestsAllowed`, `timeWindowMinutes`
- **API Key**: `allowUnauthenticatedRequests`, `cacheTtlSeconds`
- **Validation**: `validateBody`, `validateHeaders`, `validateQueryParameters`
- **Size Limit**: `maxSizeInBytes`

## Commands

```bash
npm install    # Install dependencies
npm run dev    # Start local dev server (http://localhost:9000)
npm run test   # Run tests
zuplo deploy   # Deploy to Zuplo cloud
```

## Testing Locally

When running locally with `npm run dev`, API key validation is bypassed. Use any value:
```bash
curl http://localhost:9000/todos -H "Authorization: Bearer test-key"
```

## Important Patterns

- Routes use `urlForwardHandler` from `@zuplo/runtime` to proxy to upstream APIs
- Handler reference format: `"module": "$import(@zuplo/runtime)"` or `"module": "$import(./modules/my-handler)"`
- Policies execute in order listed in the `inbound` array
- All configuration is declarative JSON - no code needed for standard policies

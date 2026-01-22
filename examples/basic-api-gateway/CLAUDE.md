# Basic API Gateway

A Zuplo API Gateway example demonstrating authentication, rate limiting, request validation, and request size limits. The gateway proxies requests to a backend Todo API while applying security policies.

## Project Structure

| Path | Purpose |
|------|---------|
| `config/routes.oas.json` | OpenAPI route definitions with `x-zuplo-route` extensions |
| `config/policies.json` | Policy configurations (rate limiting, auth, validation, size limits) |
| `modules/*.ts` | Custom TypeScript handlers and policies |
| `docs/` | Developer portal configuration (Zudoku) |
| `package.json` | Dependencies (includes `zuplo` package) |
| `zuplo.jsonc` | Zuplo project metadata |

## Route Configuration

Routes are defined in OpenAPI 3.1 format with Zuplo extensions. Example structure:

```json
{
  "paths": {
    "/todos": {
      "get": {
        "x-zuplo-route": {
          "handler": {
            "export": "urlForwardHandler",
            "module": "$import(@zuplo/runtime)",
            "options": { "baseUrl": "https://todo.zuplo.io" }
          },
          "policies": {
            "inbound": ["api-key-inbound", "rate-limit-inbound"]
          }
        }
      }
    }
  }
}
```

## Policies

Configured in `config/policies.json`:

| Policy | Purpose | Key Options |
|--------|---------|-------------|
| `api-key-inbound` | API key authentication | `allowUnauthenticatedRequests`, `cacheTtlSeconds` |
| `rate-limit-inbound` | Rate limiting | `rateLimitBy`, `requestsAllowed`, `timeWindowMinutes` |
| `request-validation-inbound` | JSON schema validation | `validateBody`, `validateHeaders` |
| `request-size-limit-inbound` | Limit request body size | `maxSizeInBytes` |

## Handler Pattern

Custom handlers export a default async function:

```typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  context.log.info("Processing request");
  return new Response(JSON.stringify({ data: "value" }), {
    headers: { "content-type": "application/json" }
  });
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/todos` | Retrieve all todo items |
| POST | `/todos` | Create a new todo (requires `title`, `userId`) |
| PUT | `/todos/{id}` | Update an existing todo |
| DELETE | `/todos/{id}` | Delete a todo |

## Commands

```bash
npm install    # Install dependencies
npm run dev    # Start local dev server (http://localhost:9000)
npm run test   # Run tests
zuplo deploy   # Deploy to Zuplo cloud
```

## Testing

Local development bypasses API key validation. Use any value:

```bash
curl http://localhost:9000/todos -H "Authorization: Bearer test-key"
```

## Common Tasks

### Add a New Route
1. Add the path and operation to `config/routes.oas.json`
2. Include `x-zuplo-route` with handler and policies
3. Add schemas to `components/schemas` if the route has a request body

### Add a New Policy
1. Add policy configuration to `config/policies.json`
2. Reference the policy name in the route's `policies.inbound` array

### Change Upstream API
Modify the `baseUrl` in the handler options within `config/routes.oas.json`

## Key Imports

```typescript
import {
  ZuploContext,
  ZuploRequest,
  environment,    // Environment variables
} from "@zuplo/runtime";
```

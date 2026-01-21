# Zuplo Examples Repository

This repository contains example API gateway projects built with Zuplo. Each example demonstrates a specific feature or pattern.

## Zuplo Project Structure

Every Zuplo project follows this structure:

| Path | Purpose |
|------|---------|
| `config/routes.oas.json` | OpenAPI route definitions with `x-zuplo-route` extensions |
| `config/policies.json` | Policy configurations (rate limiting, auth, caching, etc.) |
| `modules/*.ts` | Custom TypeScript handlers and policies |
| `docs/` | Optional Zudoku documentation portal |
| `package.json` | Dependencies (always includes `zuplo` package) |
| `zuplo.jsonc` | Zuplo project metadata |

## Route Configuration

Routes are defined in OpenAPI format with Zuplo-specific extensions:

```json
{
  "paths": {
    "/example": {
      "get": {
        "x-zuplo-route": {
          "handler": {
            "export": "default",
            "module": "$import(./modules/my-handler)"
          },
          "policies": {
            "inbound": ["rate-limit-policy"],
            "outbound": []
          }
        }
      }
    }
  }
}
```

## Handler Pattern

Handlers export a default async function:

```typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  const data = { message: "Hello" };
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" }
  });
}
```

## Policy Pattern

Custom policies follow this signature:

```typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

interface PolicyOptions {
  // Define your options here
}

export default async function (
  request: ZuploRequest,
  context: ZuploContext,
  options: PolicyOptions,
  policyName: string
): Promise<ZuploRequest | Response> {
  // Return request to continue, or Response to short-circuit
  return request;
}
```

## Common Commands

- `npm run dev` - Start local dev server (https://localhost:9000)
- `npm run test` - Run tests with `zuplo test`
- `zuplo deploy` - Deploy to Zuplo cloud

## Getting an Example

To create a local copy of any example:
```bash
npx create-zuplo-api@latest --example {example-name}
```

## Deploying to Zuplo

**Option 1: CLI Deploy** (from within an example directory)
```bash
zuplo deploy
```

**Option 2: One-Click Deploy**
Each example has a "Deploy to Zuplo" button on its documentation page at:
`https://zuplo.com/docs/examples/{example-name}`

This creates a new project in your Zuplo account with the example pre-configured.

## Key Imports

```typescript
import {
  ZuploContext,
  ZuploRequest,
  ZoneCache,      // Distributed caching
  environment,    // Environment variables
} from "@zuplo/runtime";
```

## Useful Context Properties

- `context.log.info()` / `.warn()` / `.error()` - Structured logging
- `context.custom` - Pass data between policies
- `context.route` - Current route metadata
- `request.user` - Authenticated user (if auth policy applied)

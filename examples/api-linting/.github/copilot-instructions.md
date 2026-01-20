# GitHub Copilot Instructions for Zuplo Examples

This repository contains example API gateway projects built with Zuplo.

## Project Structure

Each example follows this structure:
- `config/routes.oas.json` - OpenAPI route definitions with `x-zuplo-route` extensions
- `config/policies.json` - Policy configurations for rate limiting, auth, caching, etc.
- `modules/*.ts` - Custom TypeScript handlers and policies
- `package.json` - Dependencies (always includes `zuplo` package)

## Code Patterns

### Handlers
```typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  return new Response(JSON.stringify({ data: "value" }), {
    headers: { "content-type": "application/json" }
  });
}
```

### Custom Policies
```typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

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

## Key Imports
- `ZuploContext`, `ZuploRequest` - Core types from @zuplo/runtime
- `ZoneCache` - Distributed caching
- `environment` - Environment variables

## Common Operations
- Logging: `context.log.info()`, `.warn()`, `.error()`
- Pass data between policies: `context.custom`
- Access route metadata: `context.route`
- Authenticated user: `request.user`

## Commands
- `npm run dev` - Start local dev server
- `npm run test` - Run tests
- `zuplo deploy` - Deploy to Zuplo cloud

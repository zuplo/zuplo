# Custom Rate Limit Response

This example demonstrates how to invoke the Rate Limit policy programmatically and customize the 429 (Too Many Requests) response body with additional context information like rate limit details.

By default, Zuplo's rate limit policy returns a standard 429 response. This example shows how to intercept that response and add useful information like the rate limit configuration, remaining requests, and retry timing.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli):

```bash
npx create-zuplo-api@latest --example custom-429-response
```

Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## How It Works

This example uses two key techniques:

### 1. Programmatic Policy Invocation

Instead of applying the rate limit policy directly in the route configuration, a custom policy invokes it programmatically using `context.invokeInboundPolicy()`:

```typescript
const result = await context.invokeInboundPolicy("rate-limit-inbound", request);
```

This allows the custom policy to intercept the response and modify it.

### 2. Custom 429 Response

When the rate limit is exceeded, the custom policy creates a detailed error response using `HttpProblems.tooManyRequests()`:

```typescript
if (result.status === 429) {
  const rateLimits = ContextData.get(context, "rateLimits");
  return HttpProblems.tooManyRequests(request, context, {
    rateLimits,
  });
}
```

### 3. ContextData for Passing Information

The rate limit key function stores the rate limit configuration in `ContextData`, making it available for the custom response:

```typescript
ContextData.set(context, "rateLimits", rateLimits);
```

## Project Structure

```text
├── config/
│   ├── policies.json      # Policy configurations
│   └── routes.oas.json    # Route definitions
└── modules/
    └── rate-limiting.ts   # Custom rate limit wrapper and key function
```

## Configuration

### Rate Limit Settings

The rate limit is configured in `config/policies.json`:

| Option | Value | Description |
|--------|-------|-------------|
| `requestsAllowed` | 2 | Maximum requests allowed |
| `timeWindowMinutes` | 1 | Time window for the limit |
| `rateLimitBy` | "function" | Use custom function for rate limit key |

### Custom Rate Limit Key

The `rateLimitKey` function in `modules/rate-limiting.ts` determines how requests are grouped for rate limiting:

```typescript
export function rateLimitKey(request, context, policyName) {
  return {
    key: "my-key", // Change to request.user.sub for per-user limits
    requestsAllowed: 2,
    timeWindowMinutes: 1,
  };
}
```

## Testing the Example

Make multiple requests to trigger the rate limit:

```bash
# First two requests succeed (within the 2 request limit)
curl http://localhost:9000/test
curl http://localhost:9000/test

# Third request returns custom 429 response
curl http://localhost:9000/test -i
```

### Expected 429 Response

When rate limited, you'll receive a detailed JSON response:

```json
{
  "type": "https://httpproblems.com/http-status/429",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded",
  "instance": "/test",
  "rateLimits": {
    "key": "my-key",
    "requestsAllowed": 2,
    "timeWindowMinutes": 1
  }
}
```

## Common Customizations

- **Per-user rate limits**: Change the key to `request.user.sub` after adding authentication
- **Different limits per tier**: Use `request.user.data.tier` to set different limits for different customer tiers
- **Add retry-after info**: Include timing information in the custom response
- **Log rate limit events**: Add logging when rate limits are hit

## Key Concepts Demonstrated

- `context.invokeInboundPolicy()` - Programmatically invoke other policies
- `ContextData` - Pass data between policy functions
- `HttpProblems` - Create RFC 7807 compliant error responses
- `CustomRateLimitDetails` - Type-safe rate limit configuration

## Learn More

- [Rate Limit Policy](https://zuplo.com/docs/policies/rate-limit-inbound)
- [Custom Policies](https://zuplo.com/docs/policies/custom-code-inbound)
- [HTTP Problems](https://zuplo.com/docs/articles/http-problems)
- [Context Data](https://zuplo.com/docs/articles/context-data)

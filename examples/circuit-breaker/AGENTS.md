# Agent Instructions: Circuit Breaker Example

This file provides instructions for AI agents working with this Zuplo example.

## Before You Start

This example requires no API keys and no local environment variables. The only prerequisite is a Zuplo account and a deployed project. All testing is done against the deployed gateway URL.

## Setup Workflow

### Phase 1: Agent-Executable (Automated)

```bash
# Get a local copy (optional — only needed if modifying the code)
npx create-zuplo-api@latest --example circuit-breaker
cd circuit-breaker

# Deploy to Zuplo
zuplo deploy
```

### Phase 2: Human-Required (Portal Access)

Stop and inform the user of the following:

> To use this example, you need a Zuplo account. If you don't have one, sign up at [portal.zuplo.com](https://portal.zuplo.com).
>
> Once you have an account, you can deploy the example by clicking the **Deploy to Zuplo** button on the example page, or by running `zuplo deploy` from the example directory.
>
> After deployment, copy your gateway URL from the Zuplo Portal and share it so we can run the tests.

### Phase 3: Agent-Executable (Testing)

Once the user provides their gateway URL:

```bash
# 1. Confirm the circuit is closed and requests flow normally
curl -s --http1.1 https://YOUR_GATEWAY_URL/todos | head

# 2. Trip the circuit (5 simulated failures)
for i in {1..5}; do
  curl -s -o /dev/null -w "Request $i: %{http_code}\n" \
    --http1.1 \
    -H "x-simulate-failure: true" https://YOUR_GATEWAY_URL/todos
done

# 3. Confirm the circuit is open (expect 503)
curl -s --http1.1 -w "\nHTTP %{http_code}\n" https://YOUR_GATEWAY_URL/todos

# 4. Wait for cooldown, then confirm recovery
sleep 30
curl -s --http1.1 -w "\nHTTP %{http_code}\n" https://YOUR_GATEWAY_URL/todos
```

## File Modification Guidelines

### Safe to Modify

| File | Purpose | Notes |
|------|---------|-------|
| `config/policies.json` | Circuit breaker options | Change `failureThreshold`, `cooldownSeconds`, `backendId` |
| `config/routes.oas.json` | API routes | Add/remove routes or apply circuit breaker to new paths |
| `modules/circuit-breaker-inbound.ts` | Circuit gate logic | Modify state transition rules |
| `modules/circuit-breaker-outbound.ts` | Failure tracking logic | Modify what counts as a failure |
| `modules/todo-handler.ts` | Request proxy + failure sim | Replace with `urlForwardHandler` for production use |

### Do Not Modify

| File | Reason |
|------|--------|
| `zuplo.jsonc` | Project metadata managed by Zuplo |
| `tsconfig.json` | TypeScript config tuned for Zuplo runtime |
| `package.json` | Dependencies managed for Zuplo compatibility |

## Code Patterns

### Inbound policy — block or pass

```typescript
// Block the request
return HttpProblems.serviceUnavailable(request, context, {
  detail: "Service temporarily unavailable.",
});

// Allow the request through
return request;
```

### ZoneCache — read and write circuit state

```typescript
const cache = new ZoneCache<CircuitState>("circuit-breaker", context);
const state = (await cache.get(`cb:${options.backendId}`)) ?? { ...DEFAULT_STATE };

// Write updated state (TTL in seconds)
await cache.put(`cb:${options.backendId}`, state, options.stateTtlSeconds ?? 300);
```

### Outbound policy — inspect the response

```typescript
export default async function circuitBreakerOutbound(
  response: Response,
  request: ZuploRequest,
  context: ZuploContext,
  options: CircuitBreakerOptions,
  policyName: string,
) {
  if (response.ok) { /* success path */ }
  // failure path
  return response;
}
```

## Testing Commands

```bash
# Normal request
curl -s --http1.1 https://YOUR_GATEWAY_URL/todos

# Simulate failure
curl -s -w "%{http_code}\n" --http1.1 \
  -H "x-simulate-failure: true" \
  https://YOUR_GATEWAY_URL/todos

# Create a todo
curl -s -X POST --http1.1 \
  -H "Content-Type: application/json" \
  -d '{"title":"test","userId":1}' \
  https://YOUR_GATEWAY_URL/todos
```

## Deployment

```bash
zuplo deploy
```

After deploying, the gateway URL is available in the Zuplo Portal under your project.

## Common Issues

| Symptom | Likely Cause | Agent Action |
|---------|-------------|--------------|
| All requests return 503 immediately | Circuit is open | Wait `cooldownSeconds` (default 30s) before retrying |
| Circuit not tripping after 5 failures | `backendId` mismatch between inbound/outbound | Check `config/policies.json` — both policies must share the same `backendId` |
| Responses still 200 after tripping | ZoneCache not shared across requests | This can happen locally; circuit breaker state requires deployment |
| `500` from backend during testing | Expected when using `x-simulate-failure` header | Send 5 failures to open the circuit, then test without the header |

## User Communication Templates

### Initial Setup Message

> This example requires a deployed Zuplo project. Please deploy using the **Deploy to Zuplo** button or by running `zuplo deploy`. Once deployed, share your gateway URL and I'll run the circuit breaker tests for you.

### Ready to Test Message

> The example is deployed. I'll run through the full circuit breaker test sequence:
> 1. Confirm requests flow normally
> 2. Send 5 simulated failures to trip the circuit
> 3. Confirm the circuit blocks traffic (503)
> 4. Wait 30 seconds and confirm recovery
>
> Replace `YOUR_GATEWAY_URL` with your gateway URL from the Zuplo Portal.

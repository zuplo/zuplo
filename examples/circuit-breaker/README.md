# Circuit Breaker

This example demonstrates how to implement the circuit breaker pattern as custom inbound and outbound policies in Zuplo. It proxies a real todo API at `https://todo.zuplo.io` and includes a failure simulator so you can see the circuit breaker in action.

This pattern is useful for:

- **Backend protection**: Automatically stop forwarding traffic when a downstream service is failing
- **Fast failure**: Return immediate 503 responses instead of waiting for a broken backend to time out
- **Self-healing**: Automatically probe the backend after a cooldown period and restore traffic when it recovers

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).

## Deploy this example to Zuplo

Click the **Deploy to Zuplo** button anywhere on this page to create a new project in your Zuplo account with this example pre-configured. No additional setup is required.

## How It Works

Two custom policies wrap every request:

**Circuit breaker inbound** (`circuit-breaker-inbound.ts`): Checks the circuit state before each request. If the circuit is open, it immediately returns a 503 response. If the cooldown period has elapsed, it transitions to half-open and allows the request through.

**Circuit breaker outbound** (`circuit-breaker-outbound.ts`): Inspects the response after each request. On failure, it increments the failure counter and opens the circuit when the threshold is reached. On success during half-open state, it closes the circuit.

Both policies share state through [ZoneCache](https://zuplo.com/docs/programmable-api/zone-cache), which provides low-latency access to shared data within a deployment zone.

The included `todo-handler.ts` proxies requests to `https://todo.zuplo.io` and accepts an `x-simulate-failure: true` header to return a 500 instead of proxying, so you can test the circuit breaker without a real outage.

### Request Flow

1. Request arrives at the gateway
2. **Inbound policy** checks circuit state in ZoneCache
   - `closed` → allow through
   - `open` (cooldown active) → return 503 immediately
   - `open` (cooldown expired) → transition to `half-open`, allow through
3. Handler proxies to `https://todo.zuplo.io` (or simulates failure)
4. **Outbound policy** inspects the response
   - Success + `half-open` → close circuit, reset counter
   - Failure → increment counter; open circuit if threshold reached

## Project Structure

```
├── config/
│   ├── routes.oas.json              # OpenAPI spec with route definitions
│   └── policies.json                # Circuit breaker policy configuration
├── modules/
│   ├── circuit-breaker-inbound.ts   # Inbound policy: gate requests by circuit state
│   ├── circuit-breaker-outbound.ts  # Outbound policy: track failures and trip circuit
│   └── todo-handler.ts              # Request handler with failure simulation
└── zuplo.jsonc                      # Zuplo project metadata
```

**Key files:**

- **`modules/circuit-breaker-inbound.ts`**: Reads circuit state from ZoneCache. Blocks requests when open; transitions to half-open when cooldown expires.
- **`modules/circuit-breaker-outbound.ts`**: Writes circuit state to ZoneCache. Increments failure count on errors; resets on successful half-open probe.
- **`config/policies.json`**: Configures `failureThreshold`, `cooldownSeconds`, and `backendId` for each circuit breaker policy.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/todos` | Get all todo items |
| `POST` | `/todos` | Create a new todo |
| `PUT` | `/todos/{id}` | Update a todo by ID |
| `DELETE` | `/todos/{id}` | Delete a todo by ID |

All endpoints are protected by the circuit breaker.

## Testing the Circuit Breaker

Replace `YOUR_GATEWAY_URL` with your deployed gateway's URL.

### 1. Confirm requests flow normally

```bash
curl -s --http1.1 https://YOUR_GATEWAY_URL/todos | head
```

You should get back a list of todos from the real backend.

### 2. Trip the circuit

```bash
for i in {1..5}; do
  curl -s -o /dev/null -w "Request $i: %{http_code}\n" \
    --http1.1 \
    -H "x-simulate-failure: true" https://YOUR_GATEWAY_URL/todos
done
```

You'll see five 500 responses. After the 5th, the circuit opens.

### 3. Confirm the circuit is open

```bash
curl -s --http1.1 -w "\nHTTP %{http_code}\n" https://YOUR_GATEWAY_URL/todos
```

No failure header this time — you get a 503 back instantly because the circuit is blocking all traffic to the backend.

### 4. Wait for recovery

```bash
sleep 30
curl -s --http1.1 -w "\nHTTP %{http_code}\n" https://YOUR_GATEWAY_URL/todos
```

The circuit transitions to half-open, lets this request through to the real backend, it succeeds, and the circuit closes. Subsequent requests flow normally again.

## Configuration

Both circuit breaker policies accept the same options (configured in `config/policies.json`):

| Option | Type | Description |
|--------|------|-------------|
| `failureThreshold` | number | Failures before the circuit opens (default: 5) |
| `cooldownSeconds` | number | Seconds to wait before half-open test (default: 30) |
| `backendId` | string | Identifier for the protected backend |
| `stateTtlSeconds` | number | Cache TTL for circuit state (default: 300) |

The `backendId` field lets you use different circuit breakers for different backends on different routes. Each backend gets its own independent failure tracking and circuit state.

## Extending This Example

- **Per-route thresholds**: Configure a payment API with a threshold of 3 and a search API with a threshold of 10
- **Failure detection by status code**: Modify the outbound policy to only count 5xx errors, ignoring 4xx client errors
- **Response time tracking**: Open the circuit when response times exceed a threshold, not just on error codes
- **Gradual recovery**: In half-open state, allow a configurable number of test requests before fully closing the circuit
- **Production handler**: Replace `todo-handler.ts` with `urlForwardHandler` to proxy a real backend

## Troubleshooting

- [ ] Deployed the example to Zuplo
- [ ] Replaced `YOUR_GATEWAY_URL` with your actual gateway URL in curl commands

**Common errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| `503 Service Unavailable` immediately | Circuit is open | Wait for `cooldownSeconds` (default 30s) to elapse |
| `500` responses during testing | Expected — used to trip the circuit | Send 5 requests with `x-simulate-failure: true` header |
| Requests not failing after threshold | `backendId` mismatch between policies | Verify both policies use the same `backendId` in `policies.json` |

## Learn More

- [ZoneCache](https://zuplo.com/docs/programmable-api/zone-cache)
- [Custom Code Inbound Policy](https://zuplo.com/docs/policies/custom-code-inbound)
- [Custom Code Outbound Policy](https://zuplo.com/docs/policies/custom-code-outbound)
- [Zuplo Handlers](https://zuplo.com/docs/handlers/url-forward)

# Circuit Breaker Example

Implements the circuit breaker pattern as custom Zuplo policies, protecting a backend by tracking failures and blocking traffic when a threshold is exceeded.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npx create-zuplo-api@latest --example circuit-breaker` | Create a local copy |
| `zuplo deploy` | Deploy to Zuplo cloud |

## Task Breakdown: Human vs Agent

### Tasks Requiring Human Action (Portal Access)

1. **Create a Zuplo Account** - Sign up at portal.zuplo.com
2. **Deploy the example** - Use the Deploy to Zuplo button or `zuplo deploy`

### Tasks Agents Can Automate

| Task | Command/Action |
|------|----------------|
| Clone example | `npx create-zuplo-api@latest --example circuit-breaker` |
| Deploy | `zuplo deploy` |
| Modify circuit breaker thresholds | Edit `config/policies.json` |
| Modify circuit breaker logic | Edit `modules/circuit-breaker-inbound.ts` or `modules/circuit-breaker-outbound.ts` |
| Add new routes | Edit `config/routes.oas.json` |
| Test endpoints | Use curl commands (see below) |

## Project Structure

```
config/
├── routes.oas.json              # OpenAPI routes with x-zuplo-route extensions
└── policies.json                # Circuit breaker policy options
modules/
├── circuit-breaker-inbound.ts   # Gates requests by current circuit state
├── circuit-breaker-outbound.ts  # Tracks failures and trips circuit
└── todo-handler.ts              # Proxies to todo.zuplo.io; supports failure simulation
```

## How the Circuit Breaker Works

1. Request arrives → **inbound policy** reads circuit state from ZoneCache
2. `closed` → request passes through
3. `open` (cooldown active) → return 503 immediately, no backend call
4. `open` (cooldown expired) → transition to `half-open`, allow one request through
5. Handler proxies to `https://todo.zuplo.io` (or simulates failure via header)
6. **Outbound policy** reads response:
   - Success + `half-open` → close circuit, reset counter
   - Failure → increment counter; open circuit if `failureThreshold` reached

## Circuit Breaker Configuration

Both policies are configured in `config/policies.json`:

| Option | Default | Description |
|--------|---------|-------------|
| `failureThreshold` | `5` | Failures before circuit opens |
| `cooldownSeconds` | `30` | Seconds before half-open probe |
| `backendId` | `"todo-api"` | Identifies the protected backend |
| `stateTtlSeconds` | `300` | ZoneCache TTL for circuit state |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/todos` | Get all todos |
| `POST` | `/todos` | Create a todo |
| `PUT` | `/todos/{id}` | Update a todo |
| `DELETE` | `/todos/{id}` | Delete a todo |

## Testing Endpoints

```bash
# Normal request
curl -s --http1.1 https://YOUR_GATEWAY_URL/todos

# Simulate failure (send 5 times to trip circuit)
curl -s -o /dev/null -w "%{http_code}\n" \
  --http1.1 -H "x-simulate-failure: true" \
  https://YOUR_GATEWAY_URL/todos

# Confirm circuit is open (expect 503)
curl -s --http1.1 -w "\nHTTP %{http_code}\n" https://YOUR_GATEWAY_URL/todos
```

## Common Modifications

### Change failure threshold

In `config/policies.json`, update both `circuit-breaker-inbound` and `circuit-breaker-outbound` options:

```json
"options": {
  "failureThreshold": 3,
  "cooldownSeconds": 60,
  "backendId": "todo-api"
}
```

### Add circuit breaker to a new route

1. Add inbound and outbound policies to the route in `config/routes.oas.json`:
   ```json
   "policies": {
     "inbound": ["circuit-breaker-inbound"],
     "outbound": ["circuit-breaker-outbound"]
   }
   ```
2. Use a unique `backendId` in `policies.json` for independent state tracking

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `503` immediately on all requests | Circuit is open | Wait `cooldownSeconds` (default 30s) then retry |
| Circuit not tripping after failures | `backendId` mismatch between policies | Ensure both policies share the same `backendId` |
| `500` responses during testing | Expected when using `x-simulate-failure` | Send 5 to trip the circuit, then test without the header |

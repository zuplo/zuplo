# Idempotency Keys Example

Demonstrates implementing idempotency key handling with custom Zuplo policies. Idempotency keys prevent duplicate operations (like double charges) caused by retries or network issues.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Defines `/payments` POST route with inbound/outbound policies |
| `config/policies.json` | Configures TTL for cached responses |
| `modules/idempotency-inbound.ts` | Checks cache for existing idempotency key, returns cached response if found |
| `modules/idempotency-outbound.ts` | Caches successful (2xx) responses for replay |

## How It Works

1. Client includes `Idempotency-Key` header with unique value (e.g., UUID)
2. **Inbound policy**: Checks ZoneCache for cached response with this key
   - If found: Returns cached response with `X-Idempotent-Replay: true` header
   - If not found: Continues to handler, stores key in `context.custom`
3. **Outbound policy**: For 2xx responses, caches status + body in ZoneCache
4. Future requests with same key return cached response

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example idempotency-keys
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/idempotency-keys) button.

## Test Commands

```bash
# First request (processed normally)
curl -X POST http://localhost:9000/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment-abc-123" \
  -d '{"amount": 100, "currency": "USD"}' \
  -i

# Second request with same key (returns cached response)
curl -X POST http://localhost:9000/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment-abc-123" \
  -d '{"amount": 100, "currency": "USD"}' \
  -i

# Request without idempotency key (no caching)
curl -X POST http://localhost:9000/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "currency": "USD"}'
```

The second request returns cached response with `X-Idempotent-Replay: true` header.

## Policy Options

In `config/policies.json`:
- `ttlSeconds`: How long to cache responses (default: 86400 = 24 hours)

## Common Tasks

- **Change cache TTL**: Edit `ttlSeconds` in policies.json
- **Add request fingerprinting**: Hash request body in inbound policy to detect mismatched payloads
- **Scope by user**: Prefix cache key with `request.user.sub` in inbound policy
- **Replace handler**: Change `urlRewriteHandler` target in routes.oas.json to your backend
- **Use external storage**: Replace ZoneCache with Upstash Redis or DynamoDB for longer retention

## Key Patterns Demonstrated

- **Custom inbound policy**: Check cache, short-circuit with cached Response, or continue with request
- **Custom outbound policy**: Process response after handler, fire-and-forget caching
- **context.custom**: Pass data (idempotency key) from inbound to outbound policy
- **ZoneCache**: Distributed cache with TTL support

## Environment Variables

None required for this example.

## Related Docs

- [Implementing Idempotency Keys](https://zuplo.com/learning-center/implementing-idempotency-keys-in-rest-apis-a-complete-guide)
- [Custom Code Inbound Policy](https://zuplo.com/docs/policies/custom-code-inbound)
- [Custom Code Outbound Policy](https://zuplo.com/docs/policies/custom-code-outbound)
- [ZoneCache Documentation](https://zuplo.com/docs/programmable-api/zone-cache)

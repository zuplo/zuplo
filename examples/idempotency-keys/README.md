# Idempotency Keys Example

This example demonstrates how to implement idempotency key handling in Zuplo using custom policies. Idempotency keys ensure that duplicate API requests (caused by retries or network issues) don't result in duplicate operations like double charges or duplicate resource creation.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://zuplo.com).

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli):
```bash
npx create-zuplo-api@latest --example idempotency-keys
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## What is Idempotency?

Idempotency means that making the same request multiple times produces the same result as making it once. This prevents issues like double charges, duplicate orders, or inconsistent data caused by network retries, timeouts, or users clicking submit twice.

This is critical for operations like:

- Payment processing
- Order creation
- Resource provisioning
- Any operation where duplicates cause problems

Clients include an `Idempotency-Key` header with a unique value (typically a UUID). If the same key is sent again, the server returns the cached response instead of processing the request again.

## How This Example Works

This example uses two custom Zuplo policies that work together:

### Inbound Policy (`idempotency-inbound`)

1. Extracts the `Idempotency-Key` header from the request
2. Checks Zuplo's `ZoneCache` for a cached response
3. If found: returns the cached response immediately with `X-Idempotent-Replay: true` header
4. If not found: passes the key to the outbound policy and continues processing

### Outbound Policy (`idempotency-outbound`)

1. Checks if an idempotency key was provided in the original request
2. For successful responses (2xx), caches the response body and status code
3. Uses fire-and-forget caching to avoid adding latency

## Project Structure

```
├── config/
│   ├── policies.json      # Policy configuration
│   └── routes.oas.json    # Route definitions with policies applied
└── modules/
    ├── idempotency-inbound.ts   # Inbound policy (cache lookup)
    └── idempotency-outbound.ts  # Outbound policy (cache storage)
```

## Configuration

The inbound policy accepts the following options in `policies.json`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttlSeconds` | number | 86400 | How long to cache responses (in seconds) |

## Testing with curl

**First request** (processed normally):

```bash
curl -X POST http://localhost:9000/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment-abc-123" \
  -d '{"amount": 100, "currency": "USD"}' \
  -i
```

**Second request with same key** (returns cached response):

```bash
curl -X POST http://localhost:9000/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment-abc-123" \
  -d '{"amount": 100, "currency": "USD"}' \
  -i
```

The second request returns the cached response with the `X-Idempotent-Replay: true` header.

**Request without idempotency key** (no caching):

```bash
curl -X POST http://localhost:9000/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "currency": "USD"}'
```

**Note**: Replace `localhost:9000` with your Zuplo deployment URL (e.g., `your-api.zuplo.dev`) when testing a deployed project.

## Alternative Storage Options

This example uses Zuplo's `ZoneCache` for simplicity, but you may want external storage for longer retention, global consistency, or durability requirements.

Alternatives include:

- **[Upstash Redis](https://upstash.com/)**: Serverless Redis with a REST API
- **[DynamoDB](https://aws.amazon.com/dynamodb/)**: AWS key-value store with TTL support
- **[Neon](https://neon.tech/)** / **[PlanetScale](https://planetscale.com/)**: Serverless PostgreSQL/MySQL

### When to Use What

| Storage | Best for |
|---------|----------|
| **ZoneCache** | Simple use cases, short TTLs, getting started quickly |
| **Upstash Redis** | Low-latency global access, moderate TTLs, serverless environments |
| **DynamoDB** | AWS environments, long retention, high durability requirements |
| **PostgreSQL/MySQL** | Existing database infrastructure, complex queries, audit requirements |

## Extending This Example

This is a minimal implementation. For production use, consider adding:

- **Request fingerprinting**: Hash the request body to detect mismatched payloads with the same key
- **User scoping**: Prefix cache keys with `request.user.sub` to isolate keys per user
- **Concurrent request handling**: Add a "processing" marker to handle race conditions
- **Selective caching**: Only require idempotency keys for specific HTTP methods (POST, PUT, PATCH)

## Learn More

- [Implementing Idempotency Keys in REST APIs](https://zuplo.com/learning-center/implementing-idempotency-keys-in-rest-apis-a-complete-guide)
- [Custom Code Inbound Policy](https://zuplo.com/docs/policies/custom-code-inbound)
- [Custom Code Outbound Policy](https://zuplo.com/docs/policies/custom-code-outbound)
- [ZoneCache Documentation](https://zuplo.com/docs/programmable-api/zone-cache)
- [Local Development](https://zuplo.com/docs/articles/local-development)
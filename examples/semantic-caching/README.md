# Semantic Caching

This example demonstrates how to use Zuplo's [Semantic Cache Policy](https://zuplo.com/docs/policies/semantic-cache-inbound) to cache responses based on semantic similarity rather than exact matches.

With semantic caching, requests with similar meaning return cached responses even when the wording differs. For example, "What is the capital of France?" and "Tell me the capital city of France" would return the same cached response.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup?utm_source=semantic-caching-example&ref=semantic-caching-example).

## Working with this example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli/overview):

```bash
npx create-zuplo-api@latest --example semantic-caching
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## How It Works

The [Semantic Cache Policy](https://zuplo.com/docs/policies/semantic-cache-inbound) uses LLM embeddings to determine semantic similarity between cache keys. When a request comes in:

1. The policy extracts a cache key from the request (in this example, the `question` field from the JSON body, but it could be any key you want)
2. It checks for semantically similar cache keys based on the configured tolerance
3. If a match is found, the cached response is returned
4. If no match is found, the request proceeds to the handler and the response is cached

## Project Structure

The files that are most important in this example are the following:

```
├── config/
│   ├── routes.oas.json    # Route configuration with semantic cache policy
│   └── policies.json      # Policy configuration
└── modules/
    └── question-handler.ts # Simple handler for demo purposes
```

## Configuration

### Policy Configuration

The semantic cache policy is configured in `config/policies.json`:

```json
{
  "policies": [
    {
      "name": "semantic-cache",
      "policyType": "semantic-cache-inbound",
      "handler": {
        "export": "SemanticCacheInboundPolicy",
        "module": "$import(@zuplo/runtime)",
        "options": {
          // Use a property from the JSON body as the cache key
          "cacheBy": "propertyPath",
          // Extract the "question" field from the request body
          "cacheByPropertyPath": ".question",
          // Cache entries expire after 5 minutes
          "expirationSecondsTtl": 300,
          // How similar questions must be to match (0-1 scale)
          // Lower values = stricter matching, higher = more flexible
          "semanticTolerance": 0.3,
          // Add a response header showing HIT or MISS
          "returnCacheStatusHeader": true
        }
      }
    }
  ]
}
```

#### Key Options

| Option | Description |
|--------|-------------|
| `cacheBy` | How to generate the cache key. Use `propertyPath` to extract from JSON body, or `function` for custom logic. |
| `cacheByPropertyPath` | The JSON path to use as the cache key (e.g., `.question` extracts the `question` field). |
| `semanticTolerance` | How similar requests must be to match (0-1 scale). Lower values require closer matches. |
| `expirationSecondsTtl` | How long cached responses remain valid (in seconds). |
| `returnCacheStatusHeader` | When `true`, adds a `zp-semantic-cache` header showing `HIT` or `MISS`. |

For all available options, see the [Semantic Cache Policy documentation](https://zuplo.com/docs/policies/semantic-cache-inbound).

### Route Configuration

The policy is applied to the `/ask` route in `config/routes.oas.json`:

```json
{
  "paths": {
    "/ask": {
      "post": {
        "x-zuplo-route": {
          "policies": {
            "inbound": ["semantic-cache-inbound"]
          },
          "handler": {
            "export": "default",
            "module": "$import(./modules/question-handler)"
          }
        }
      }
    }
  }
}
```

## Running the Example

Start the API Gateway by running:

```bash
npm run dev
```

The server will start on `https://localhost:9000` and the endpoint will be available at `https://localhost:9000/ask`.

You can also 

## Testing the Semantic Cache

Use the following curl commands to see the semantic cache in action:

```bash
# Request 1: Initial question (expect MISS)
curl -s -i http://localhost:9000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the capital of France?"}'

# Request 2: Exact same question (expect HIT)
curl -s -i http://localhost:9000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the capital of France?"}'

# Request 3: Semantically similar question (expect HIT)
curl -s -i http://localhost:9000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Tell me the capital city of France"}'

# Request 4: Different question (expect MISS)
curl -s -i http://localhost:9000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the population of Tokyo?"}'
```

### Expected Results

| Request | Question | Expected Header |
|---------|----------|-----------------|
| 1 | "What is the capital of France?" | `zp-semantic-cache: MISS` |
| 2 | "What is the capital of France?" | `zp-semantic-cache: HIT` |
| 3 | "Tell me the capital city of France" | `zp-semantic-cache: HIT` |
| 4 | "What is the population of Tokyo?" | `zp-semantic-cache: MISS` |

The `generatedAt` timestamp in the response body lets you verify cache behavior. Cached responses will have the same timestamp as the original request.

## Using with Real LLM Responses

This example uses a simple [custom request handler](https://zuplo.com/docs/handlers/custom-handler) that returns a static response for demonstration purposes.

For production use with real LLM responses, [Zuplo's AI Gateway](https://zuplo.com/docs/ai-gateway/introduction) provides built-in semantic caching along with additional features like cost controls, team budgets, and provider abstraction.

## Next Steps

- Use [Zuplo's AI Gateway](https://zuplo.com/docs/ai-gateway/introduction) for production LLM caching with built-in semantic caching, cost controls, and observability
- Learn more about [Zuplo policies](https://zuplo.com/docs/articles/policies)
- Explore [exact-match caching](https://zuplo.com/docs/policies/caching-inbound) for non-semantic use cases
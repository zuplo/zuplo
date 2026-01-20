# Semantic Caching Example

Demonstrates Zuplo's Semantic Cache Policy - caching responses based on semantic similarity rather than exact matches. Useful for LLM/AI responses where different phrasings should return cached results.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Defines `/ask` POST route with semantic-cache policy |
| `config/policies.json` | Configures semantic cache with tolerance and TTL settings |
| `modules/question-handler.ts` | Demo handler returning a static response with timestamp |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example semantic-caching
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
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/semantic-caching) button.

## Test Commands

```bash
# First request (MISS)
curl -s -i http://localhost:9000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the capital of France?"}'

# Semantically similar (HIT - same cached response)
curl -s -i http://localhost:9000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Tell me the capital city of France"}'

# Different question (MISS)
curl -s -i http://localhost:9000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the population of Tokyo?"}'
```

The `zp-semantic-cache` header shows HIT or MISS. The `generatedAt` timestamp in the response body proves cache behavior.

## Policy Options

Key options in `config/policies.json`:
- `cacheByPropertyPath`: JSON path for cache key (e.g., `.question`)
- `semanticTolerance`: 0-1 scale, lower = stricter matching (default: 0.3)
- `expirationSecondsTtl`: Cache TTL in seconds (default: 300)
- `returnCacheStatusHeader`: Adds `zp-semantic-cache` header when true

## Common Tasks

- **Adjust cache tolerance**: Edit `semanticTolerance` in policies.json (lower = stricter)
- **Change cache key source**: Modify `cacheByPropertyPath` to extract from different field
- **Add real LLM backend**: Replace handler with URL Rewrite to OpenAI/Anthropic API
- **Add authentication**: Add auth policy to inbound array in routes.oas.json

## Environment Variables

None required for this demo example.

## Related Docs

- [Semantic Cache Policy](https://zuplo.com/docs/policies/semantic-cache-inbound)
- [AI Gateway](https://zuplo.com/docs/ai-gateway/introduction)
- [Custom Handlers](https://zuplo.com/docs/handlers/custom-handler)

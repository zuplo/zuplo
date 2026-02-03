# Dynamic Rate Limiting Example

This Zuplo example demonstrates tiered rate limiting, where the same endpoint applies different rate limits based on API key metadata (e.g., premium vs free customers).

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npx create-zuplo-api@latest --example dynamic-rate-limits` | Create fresh copy |
| `npm install` | Install dependencies |
| `npx zuplo link` | Connect to Zuplo services |
| `npm run dev` | Start dev server (localhost:9000) |
| `zuplo deploy` | Deploy to Zuplo cloud |

## Task Breakdown: Human vs Agent

### Tasks Requiring Human Action (Portal Access)

These tasks **cannot** be automated and require the user to access the [Zuplo Portal](https://portal.zuplo.com):

1. **Create a Zuplo Account** - Sign up at portal.zuplo.com
2. **Create a Zuplo Project** - Required for API Key Service
3. **Configure API Key Service** - Navigate to Services → API Key Service → Configure
4. **Create API Keys with Metadata** - Must be done in portal:
   - Create consumer with metadata `{"customerType": "premium"}`
   - Create consumer with metadata `{"customerType": "free"}`
5. **Authenticate `zuplo link`** - Interactive prompt requires human selection

### Tasks Agents Can Automate

These tasks can be performed via CLI or file operations:

| Task | Command/Action |
|------|----------------|
| Clone example | `npx create-zuplo-api@latest --example dynamic-rate-limits` |
| Install dependencies | `npm install` |
| Start dev server | `npm run dev` |
| Run tests | `npm run test` |
| Deploy (after setup) | `zuplo deploy` |
| Modify routes | Edit `config/routes.oas.json` |
| Modify policies | Edit `config/policies.json` |
| Modify rate limit logic | Edit `modules/dynamic-rate-limiter.ts` |
| Test endpoints | Use curl with provided API keys |

## Project Structure

```
config/
├── routes.oas.json      # OpenAPI routes with x-zuplo-route extensions
└── policies.json        # Policy configurations (api-key-inbound, rate-limit-inbound)
modules/
└── dynamic-rate-limiter.ts  # Custom function reading API key metadata for rate limits
```

## How the Rate Limiting Works

1. Request hits endpoint with `Authorization: Bearer <API_KEY>`
2. `api-key-inbound` policy validates key and populates `request.user`
3. `rate-limit-inbound` policy calls the custom `rateLimit` function
4. Function reads `request.user.data.customerType` from metadata
5. Returns rate limit config based on customer type:
   - `premium`: 1000 requests/minute
   - `free`: 5 requests/minute
   - default: 30 requests/minute

## Rate Limit Tiers

| Customer Type | Requests Allowed | Time Window |
|---------------|------------------|-------------|
| `premium` | 1000 | 1 minute |
| `free` | 5 | 1 minute |
| (default) | 30 | 1 minute |

## Testing Endpoints

Once setup is complete and `npm run dev` is running:

```bash
# Premium request (high limit)
curl -i http://localhost:9000/todos \
  -H "Authorization: Bearer YOUR_PREMIUM_API_KEY"

# Free request (low limit)
curl -i http://localhost:9000/todos \
  -H "Authorization: Bearer YOUR_FREE_API_KEY"
```

Check `ratelimit-limit` header in response to verify the tier.

## Common Modifications

### Adding a New Tier

Update `modules/dynamic-rate-limiter.ts`:

```typescript
// Add before the default return
if (user.data.customerType === "enterprise") {
  return {
    key: user.sub,
    requestsAllowed: 10000,
    timeWindowMinutes: 1,
  };
}
```

Then create API key in portal with metadata `{"customerType": "enterprise"}`

### Changing Time Windows

Modify `timeWindowMinutes` in the return object:

```typescript
// Hourly limit instead of per-minute
return {
  key: user.sub,
  requestsAllowed: 1000,
  timeWindowMinutes: 60,
};
```

### Adding a New Route

Add to `config/routes.oas.json` under `paths`:

```json
"/new-endpoint": {
  "get": {
    "operationId": "new-endpoint",
    "x-zuplo-route": {
      "handler": {
        "export": "urlForwardHandler",
        "module": "$import(@zuplo/runtime)",
        "options": {
          "baseUrl": "https://your-backend.com"
        }
      },
      "policies": {
        "inbound": ["api-key-inbound", "rate-limit-inbound"]
      }
    }
  }
}
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid/missing API key | Check Authorization header format |
| `429 Too Many Requests` | Rate limit exceeded | Wait for reset or use higher-tier key |
| Wrong rate limit applied | Missing customerType metadata | Verify API key has correct metadata in portal |
| Connection refused | Dev server not running | Run `npm run dev` |
| API Key Service errors | Not linked | Run `npx zuplo link` |

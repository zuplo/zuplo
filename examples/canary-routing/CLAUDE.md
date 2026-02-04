# Canary Routing Example

This Zuplo example demonstrates percentage-based canary deployments at the API gateway level, routing traffic between production and canary backends based on user allow-lists, explicit headers, or traffic percentage.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npx create-zuplo-api@latest --example canary-routing` | Create fresh copy |
| `npm install` | Install dependencies |
| `cp env.example .env` | Create local environment file (includes working mock URLs) |
| `npx zuplo link` | Connect to Zuplo services |
| `npm run dev` | Start dev server (localhost:9000) |
| `zuplo deploy` | Deploy to Zuplo cloud |

## Task Breakdown: Human vs Agent

### Tasks Requiring Human Action (Portal Access)

These tasks **cannot** be automated and require the user to access the [Zuplo Portal](https://portal.zuplo.com):

1. **Create a Zuplo Account** - Sign up at portal.zuplo.com
2. **Create a Zuplo Project** - Required for API Key Service
3. **Configure API Key Service** - Navigate to Services → API Key Service → Configure
4. **Create API Key Consumers** - Must be done in portal
5. **Authenticate `zuplo link`** - Interactive prompt requires human selection
6. **Set Production Environment Variables** - Settings → Environment Variables in portal

### Tasks Agents Can Automate

| Task | Command/Action |
|------|----------------|
| Clone example | `npx create-zuplo-api@latest --example canary-routing` |
| Install dependencies | `npm install` |
| Create .env file | `cp env.example .env` |
| Start dev server | `npm run dev` |
| Deploy (after setup) | `zuplo deploy` |
| Modify routes | Edit `config/routes.oas.json` |
| Modify policies | Edit `config/policies.json` |
| Modify routing logic | Edit `modules/canary-routing.ts` |
| Test endpoints | Use curl with provided API keys |

## Project Structure

```
config/
├── routes.oas.json      # OpenAPI routes with x-zuplo-route extensions
└── policies.json        # Policy configurations (api-key-auth, canary-routing)
modules/
└── canary-routing.ts    # Custom policy implementing routing logic
```

## How Canary Routing Works

1. Request hits endpoint with `Authorization: Bearer <API_KEY>`
2. `api-key-auth` policy validates key and populates `request.user`
3. `canary-routing` policy evaluates routing priority:
   - User in `CANARY_USERS` → route to canary
   - `x-stage: canary` header → route to canary
   - Hash of session/IP < `CANARY_PERCENTAGE` → route to canary
   - Default → route to production
4. Sets `context.custom.backendUrl` to selected backend
5. URL Rewrite handler forwards to `${context.custom.backendUrl}`

## Environment Variables

| Variable | Purpose | Default Mock Value |
|----------|---------|-------------------|
| `API_URL_PRODUCTION` | Production backend URL | `https://9b720748f6564204b6e2e0baa095d779_oas.api.mockbin.io` |
| `API_URL_CANARY` | Canary backend URL | `https://3e99109e442f4df598c518114b250e0d_oas.api.mockbin.io` |
| `CANARY_PERCENTAGE` | Traffic percentage to canary (0-100) | `10` |
| `CANARY_USERS` | Comma-separated consumer names for canary | (empty) |

## Testing Endpoints

Once setup is complete and `npm run dev` is running:

```bash
# Route to production (default)
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer YOUR_API_KEY"

# Route to canary via header
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "x-stage: canary"
```

Verify routing by checking `livemode` in response:
- **Production**: `"livemode": true`
- **Canary**: `"livemode": false`

## Common Modifications

### Adjusting Canary Percentage

Update `.env`:
```
CANARY_PERCENTAGE=50
```

### Adding Users to Canary Allow-List

1. Create API key consumer in portal (e.g., `beta-tester-alice`)
2. Update `.env`:
   ```
   CANARY_USERS=beta-tester-alice,beta-tester-bob
   ```

### Adding a New Route

Add to `config/routes.oas.json` under `paths`:

```json
"/v1/new-endpoint": {
  "get": {
    "operationId": "new-endpoint",
    "x-zuplo-route": {
      "handler": {
        "export": "urlRewriteHandler",
        "module": "$import(@zuplo/runtime)",
        "options": {
          "rewritePattern": "${context.custom.backendUrl}/v1/new-endpoint"
        }
      },
      "policies": {
        "inbound": ["api-key-auth", "canary-routing"]
      }
    }
  }
}
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid/missing API key | Check Authorization header format |
| Requests always go to production | `CANARY_PERCENTAGE` is 0 | Set percentage or use `x-stage: canary` header |
| `API_URL_CANARY not configured` | Missing env var | Add `API_URL_CANARY` to `.env` |
| User allow-list not working | Consumer name mismatch | Verify consumer name matches `CANARY_USERS` exactly |
| API Key Service errors | Not linked | Run `npx zuplo link` |

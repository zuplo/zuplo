# Environment-Based Routing Example

This Zuplo example demonstrates Stripe-style API key routing, where the same endpoint routes to different backends (sandbox/production) based on API key metadata.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npx create-zuplo-api@latest --example environment-routing` | Create fresh copy |
| `npm install` | Install dependencies |
| `cp env.example .env` | Create local environment file |
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
   - Create consumer with metadata `{"environment": "sandbox"}`
   - Create consumer with metadata `{"environment": "production"}`
5. **Set Production Environment Variables** - Settings → Environment Variables in portal
6. **Authenticate `zuplo link`** - Interactive prompt requires human selection

### Tasks Agents Can Automate

These tasks can be performed via CLI or file operations:

| Task | Command/Action |
|------|----------------|
| Clone example | `npx create-zuplo-api@latest --example environment-routing` |
| Install dependencies | `npm install` |
| Create .env file | `cp env.example .env` |
| Start dev server | `npm run dev` |
| Run tests | `npm run test` |
| Deploy (after setup) | `zuplo deploy` |
| Modify routes | Edit `config/routes.oas.json` |
| Modify policies | Edit `config/policies.json` |
| Modify routing logic | Edit `modules/environment-routing.ts` |
| Test endpoints | Use curl with provided API keys |

## Project Structure

```
config/
├── routes.oas.json      # OpenAPI routes with x-zuplo-route extensions
└── policies.json        # Policy configurations (api-key-auth, environment-routing)
modules/
└── environment-routing.ts  # Custom policy reading API key metadata
```

## How the Routing Works

1. Request hits endpoint with `Authorization: Bearer <API_KEY>`
2. `api-key-auth` policy validates key and populates `request.user`
3. `environment-routing` policy reads `request.user.data.environment`
4. Sets `context.custom.backendUrl` based on environment value
5. URL Rewrite handler forwards to `${context.custom.backendUrl}`

## Environment Variables

| Variable | Purpose | Default Mock Value |
|----------|---------|-------------------|
| `SANDBOX_BACKEND_URL` | Sandbox backend URL | `https://3e99109e442f4df598c518114b250e0d_oas.api.mockbin.io` |
| `PRODUCTION_BACKEND_URL` | Production backend URL | `https://9b720748f6564204b6e2e0baa095d779_oas.api.mockbin.io` |

## Testing Endpoints

Once setup is complete and `npm run dev` is running:

```bash
# Sandbox request
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer YOUR_SANDBOX_API_KEY"

# Production request  
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer YOUR_PRODUCTION_API_KEY"
```

## Common Modifications

### Adding a New Environment

1. Add new environment variable in `.env`:
   ```
   STAGING_BACKEND_URL=https://your-staging-backend.com
   ```

2. Update `modules/environment-routing.ts`:
   ```typescript
   } else if (userEnvironment === "staging") {
     context.custom.backendUrl = environment.STAGING_BACKEND_URL;
     context.log.info("Routing to staging environment");
   }
   ```

3. Create API key in portal with metadata `{"environment": "staging"}`

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
        "inbound": ["api-key-auth", "environment-routing"]
      }
    }
  }
}
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid/missing API key | Check Authorization header format |
| `403 Forbidden` | Missing environment metadata | Verify API key has `{"environment": "sandbox"}` or `{"environment": "production"}` |
| `SANDBOX_BACKEND_URL is not defined` | Missing .env | Run `cp env.example .env` |
| Connection refused | Dev server not running | Run `npm run dev` |
| API Key Service errors | Not linked | Run `npx zuplo link` |

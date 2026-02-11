# Geolocation Routing Example

Route API requests to different backends based on the user's geographic location detected at the edge.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npx create-zuplo-api@latest --example geolocation-routing` | Create fresh copy |
| `npm install` | Install dependencies |
| `cp env.example .env` | Create environment file |
| `npm run dev` | Start dev server (localhost:9000) |
| `zuplo deploy` | Deploy to Zuplo cloud |

## Task Breakdown: Human vs Agent

### Tasks Requiring Human Action (Portal Access)

1. **Create a Zuplo Account** - Sign up at portal.zuplo.com
2. **Create a Zuplo Project** - Required for deployment
3. **Set Environment Variables** (optional) - Settings → Environment Variables for real backends
4. **Run `npx zuplo link`** - Interactive authentication for local development

### Tasks Agents Can Automate

| Task | Command/Action |
|------|----------------|
| Clone example | `npx create-zuplo-api@latest --example geolocation-routing` |
| Install dependencies | `npm install` |
| Start dev server | `npm run dev` |
| Deploy (after setup) | `zuplo deploy` |
| Modify routes | Edit `config/routes.oas.json` |
| Modify policies | Edit `config/policies.json` |
| Modify routing logic | Edit `modules/geolocation-routing.ts` |
| Test endpoints | Use curl with `_testCountry` param |

## Project Structure

```
config/
├── routes.oas.json         # Wildcard routes with urlForwardHandler
└── policies.json           # geolocation-routing policy config
modules/
└── geolocation-routing.ts  # Country-to-region mapping and routing
```

## How Geolocation Routing Works

1. Request arrives at Zuplo edge
2. `geolocation-routing` policy reads `context.incomingRequestProperties.country`
3. Country mapped to region via `ROUTING_CONFIG` (americas, europe, apac, global)
4. `context.custom.backendUrl` set to regional backend URL
5. Headers `X-Routed-Region` and `X-Detected-Country` added
6. `urlForwardHandler` forwards to `${context.custom.backendUrl}`

**Note**: Real geolocation only works when deployed. Locally, use `_testCountry` query param to simulate locations.

## Region Configuration

| Region | Countries | Environment Variable | Default |
|--------|-----------|---------------------|---------|
| Americas | US, CA, MX | `API_URL_AMERICAS` | `https://echo.zuplo.io` |
| Europe | GB, FR, DE, IT, ES, NL, + 20 more | `API_URL_EUROPE` | `https://echo.zuplo.io` |
| APAC | JP, KR, AU, NZ, SG, IN, + 7 more | `API_URL_APAC` | `https://echo.zuplo.io` |
| Global | All others | `API_URL_DEFAULT` | `https://echo.zuplo.io` |

## Testing Endpoints

Use `-i` to see routing headers. The `echo.zuplo.io` backend returns your request details as JSON.

```bash
# Simulate Germany (Europe) - check X-Routed-Region header
curl -i "http://localhost:9000/v1/anything?_testCountry=DE"

# Simulate Japan (APAC)
curl -i "http://localhost:9000/v1/anything?_testCountry=JP"

# Simulate United States (Americas)
curl -i "http://localhost:9000/v1/anything?_testCountry=US"

# Simulate unknown country (Global fallback)
curl -i "http://localhost:9000/v1/anything?_testCountry=XX"
```

## Common Modifications

### Add a New Region

```typescript
// In modules/geolocation-routing.ts

// 1. Add countries to ROUTING_CONFIG
BR: "latam",
AR: "latam",
CL: "latam",

// 2. Add case to getBackendUrl()
case "latam":
  return environment.API_URL_LATAM ?? "https://echo.zuplo.io";
```

### Add a Country to Existing Region

```typescript
// In ROUTING_CONFIG
ZA: "europe",  // Route South Africa to Europe region
```

### Add Authentication

```json
// In config/policies.json, add api-key-auth policy
{
  "name": "api-key-auth",
  "policyType": "api-key-inbound",
  "handler": {
    "export": "ApiKeyInboundPolicy",
    "module": "$import(@zuplo/runtime)"
  }
}

// In routes.oas.json, update inbound policies
"policies": {
  "inbound": ["api-key-auth", "geolocation-routing"]
}
```

### Add a New Route

```json
// In config/routes.oas.json under "paths"
"/v1/custom/{path}": {
  "get": {
    "operationId": "custom-get",
    "x-zuplo-route": {
      "handler": {
        "export": "urlForwardHandler",
        "module": "$import(@zuplo/runtime)",
        "options": {
          "baseUrl": "${context.custom.backendUrl}"
        }
      },
      "policies": {
        "inbound": ["geolocation-routing"]
      }
    }
  }
}
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| Always routes to global | Country not in `ROUTING_CONFIG` | Add country code to appropriate region |
| `_testCountry` not working | Query param name typo | Use exactly `_testCountry` (case-sensitive) |
| Wrong region in response | Country mapped incorrectly | Check `ROUTING_CONFIG` in `geolocation-routing.ts` |
| Headers missing | Policy not in chain | Verify `geolocation-routing` in route's inbound policies |
| Connection refused | Dev server not running | Run `npm run dev` |

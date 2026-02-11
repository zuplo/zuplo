# Geolocation Routing

Route API requests to different backends based on the user's geographic location. Zuplo detects the user's country at the edge and this example maps it to regional backends.

This pattern is useful for:

- **Data residency compliance**: Keep EU data in Europe, US data in America
- **Latency optimization**: Route users to the nearest regional backend
- **Regional feature rollouts**: Test features in specific regions before global release

## Prerequisites

- Node.js 18+ installed
- A Zuplo account (only required for deployment). You can [sign up for free](https://portal.zuplo.com/signup).

## Working with this Example

### Locally

Get a local copy using the [Zuplo CLI](https://zuplo.com/docs/cli/overview):

```bash
npx create-zuplo-api@latest --example geolocation-routing
cd geolocation-routing
npm install
cp env.example .env
```

Start the development server:

```bash
npm run dev
```

The server starts on `http://localhost:9000`.

### Deploy to Zuplo

Click the **Deploy to Zuplo** button on this page to deploy directly to your Zuplo account.

## How It Works

The `geolocation-routing` policy runs before each request:

1. Reads the user's country from `context.incomingRequestProperties.country` (detected from IP at the edge)
2. Maps the country to a region using `ROUTING_CONFIG` (americas, europe, apac, or global)
3. Sets `context.custom.backendUrl` to the regional backend URL
4. Adds `X-Routed-Region` and `X-Detected-Country` headers to the request

The `urlForwardHandler` then forwards the request to `${context.custom.backendUrl}`.

## Region Mapping

| Region | Countries | Environment Variable |
|--------|-----------|---------------------|
| Americas | US, CA, MX | `API_URL_AMERICAS` |
| Europe | GB, FR, DE, IT, ES, NL, + 20 more | `API_URL_EUROPE` |
| APAC | JP, KR, AU, NZ, SG, IN, + 7 more | `API_URL_APAC` |
| Global | All others (fallback) | `API_URL_DEFAULT` |

All regions default to `https://echo.zuplo.io` — an echo service that returns your request details as JSON, making it easy to verify routing is working.

## Project Structure

```
├── config/
│   ├── routes.oas.json       # Wildcard route using urlForwardHandler
│   └── policies.json         # Geolocation routing policy config
├── modules/
│   └── geolocation-routing.ts  # Country-to-region mapping and routing logic
└── zuplo.jsonc               # Zuplo project metadata
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/{path}` | Forward GET request to regional backend |
| `POST` | `/v1/{path}` | Forward POST request to regional backend |

## Testing

> **Note**: Real geolocation detection only works when deployed to Zuplo's edge. Locally, use the `_testCountry` query parameter to simulate different locations.

Use the `-i` flag with curl to see response headers:

```bash
# Simulate a request from Germany (routes to Europe)
curl -i "http://localhost:9000/v1/anything?_testCountry=DE"
```

You'll see headers showing the routing decision:

```
HTTP/1.1 200 OK
X-Routed-Region: europe
X-Detected-Country: DE
```

### Test different regions

```bash
# Route to Americas (United States)
curl -i "http://localhost:9000/v1/anything?_testCountry=US"

# Route to APAC (Japan)
curl -i "http://localhost:9000/v1/anything?_testCountry=JP"

# Route to global fallback (unknown country)
curl -i "http://localhost:9000/v1/anything?_testCountry=XX"
```

The response body from `echo.zuplo.io` shows your forwarded request details as JSON.

## Configuration

To route to real regional backends, set these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL_AMERICAS` | Backend for Americas | `https://echo.zuplo.io` |
| `API_URL_EUROPE` | Backend for Europe | `https://echo.zuplo.io` |
| `API_URL_APAC` | Backend for Asia-Pacific | `https://echo.zuplo.io` |
| `API_URL_DEFAULT` | Fallback for other regions | `https://echo.zuplo.io` |

**Local development**: Copy `env.example` to `.env` and update the URLs (`cp env.example .env`).

**Deployed projects**: Set in the Zuplo Portal under **Settings → Environment Variables**.

## Extending This Example

- **Add regions**: Add new entries to `ROUTING_CONFIG` and `getBackendUrl()` in `modules/geolocation-routing.ts`
- **Add authentication**: Include `api-key-auth` in the policy chain before `geolocation-routing`
- **Add rate limiting**: Apply different rate limits per region using `context.custom.region`
- **Combine with A/B testing**: Route a percentage of traffic to alternate backends per region

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Always routes to global | Country not in `ROUTING_CONFIG` | Add country code to the appropriate region |
| `_testCountry` not working | Query param name typo | Use exactly `_testCountry` (case-sensitive) |
| Wrong region in logs | Country mapped incorrectly | Check `ROUTING_CONFIG` in `geolocation-routing.ts` |
| Backend URL undefined | Environment variable not set | Defaults to echo.zuplo.io; set env var for real backend |

## Learn More

- [Geolocation Routing Guide](https://zuplo.com/docs/guides/geolocation-backend-routing)
- [Custom Code Inbound Policy](https://zuplo.com/docs/policies/custom-code-inbound)
- [ZuploContext Documentation](https://zuplo.com/docs/programmable-api/zuplo-context)
- [Environment Variables](https://zuplo.com/docs/articles/environment-variables)
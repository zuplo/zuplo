# HTTP Deprecation Example

This Zuplo example adds standards-based HTTP deprecation and sunset headers to API responses using the built-in outbound policy. No API keys or environment variables are required for the deprecation feature.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npx create-zuplo-api@latest --example http-deprecation` | Create fresh copy |
| `npm install` | Install dependencies |
| `npx zuplo link` | (Optional) Connect to Zuplo services |
| `npm run dev` | Start dev server (localhost:9000) |
| `zuplo deploy` | Deploy to Zuplo cloud |

## Task Breakdown: Human vs Agent

### Tasks Requiring Human Action (Portal Access)

These tasks **cannot** be automated when they are needed:

1. **Create a Zuplo Account** - Sign up at portal.zuplo.com (only if deploying or using Zuplo services)
2. **Create a Zuplo Project** - Required for deploy or for `zuplo link`
3. **Authenticate `zuplo link`** - Interactive prompt requires human selection (optional; gateway runs without linking)
4. **Set Environment Variables in Portal** - Only for deployed projects that need them

### Tasks Agents Can Automate

These tasks can be performed via CLI or file operations:

| Task | Command/Action |
|------|----------------|
| Clone example | `npx create-zuplo-api@latest --example http-deprecation` |
| Install dependencies | `npm install` |
| Start dev server | `npm run dev` |
| Run tests | `npm run test` |
| Deploy (after project exists) | `zuplo deploy` |
| Modify routes | Edit `config/routes.oas.json` |
| Modify policies | Edit `config/policies.json` |
| Change deprecation options | Edit `options` in `http-deprecation-outbound` in `config/policies.json` |
| Test endpoints | Use curl (no API key required) |

## Project Structure

```
config/
├── routes.oas.json      # OpenAPI routes; each route uses outbound policy http-deprecation-outbound
└── policies.json        # Defines http-deprecation-outbound with deprecation, link, sunset options
modules/
└── hello-world.ts       # Optional handler (not used by /todos routes)
```

## How Deprecation Headers Work

1. Request hits a route (e.g. `GET /todos`).
2. URL Forward handler forwards to backend (`https://todo.zuplo.io`).
3. Backend returns response (status, body, headers).
4. HTTP Deprecation Outbound policy runs on the response and adds `Deprecation`, `Sunset`, and `Link` headers.
5. Client receives response with deprecation metadata.

An **outbound** policy runs on the response after the handler, so it can add or change headers before the client sees them.

## Policy Options (config/policies.json)

| Option | Purpose | Example |
|--------|---------|---------|
| `deprecation` | Whether to add deprecation signal | `true` |
| `link` | URL to migration/deprecation docs (used in `Link` header with `rel="deprecation"`) | `"https://example.com/docs/v2-migration"` |
| `sunset` | When the endpoint may be retired (ISO 8601); Zuplo converts to HTTP-date in response | `"2025-06-30T23:59:59Z"` |

## Testing Endpoints

No API key required. With `npm run dev` running:

```bash
# Show full response including headers
curl -i http://localhost:9000/todos

# Headers only
curl -s -D - -o /dev/null http://localhost:9000/todos

# POST example
curl -i -X POST http://localhost:9000/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Migrate to v2", "completed": false, "userId": 1}'
```

Expect headers: `deprecation: true`, `sunset: Mon, 30 Jun 2025 23:59:59 GMT`, `link: <https://example.com/docs/v2-migration>; rel="deprecation"`.

## Common Modifications

### Change sunset date or migration link

Edit `config/policies.json`, policy `http-deprecation-outbound` → `handler.options`:

```json
"options": {
  "deprecation": true,
  "link": "https://your-domain.com/migration-guide",
  "sunset": "2026-12-31T23:59:59Z"
}
```

### Add deprecation to your own API (existing Zuplo project)

1. In `config/policies.json`, add a policy (or reuse this example’s):
   ```json
   {
     "handler": {
       "export": "HttpDeprecationOutboundPolicy",
       "module": "$import(@zuplo/runtime)",
       "options": {
         "deprecation": true,
         "link": "https://example.com/docs/v2-migration",
         "sunset": "2025-06-30T23:59:59Z"
       }
     },
     "name": "http-deprecation-outbound",
     "policyType": "http-deprecation-outbound"
   }
   ```
2. In `config/routes.oas.json`, for each route that should be deprecated, add to `x-zuplo-route.policies.outbound`: `"http-deprecation-outbound"`.

### Per-route deprecation

Create multiple policies in `policies.json` (e.g. `deprecation-v1`, `deprecation-v2`) with different `link` or `sunset` values, then attach the appropriate policy name to each route’s `policies.outbound` array.

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| No `deprecation` / `sunset` / `link` headers | Policy not attached or wrong name | Ensure route’s `policies.outbound` includes `"http-deprecation-outbound"` and name matches `policies.json` |
| `sunset` format wrong | Config must be ISO 8601 | Use `"2025-06-30T23:59:59Z"`; Zuplo outputs HTTP-date in response |
| Backend 4xx/5xx | Backend or network | Check `https://todo.zuplo.io` is reachable; deprecation headers are still added to the response |
| Connection refused | Dev server not running | Run `npm run dev` |

## Learn More

- [HTTP Deprecation and Sunset Headers](https://zuplo.com/docs/policies/http-deprecation-outbound)
- [URL Forward Handler](https://zuplo.com/docs/handlers/url-forward)
- [RFC 8594 – Sunset HTTP Header Field](https://www.rfc-editor.org/rfc/rfc8594.html)

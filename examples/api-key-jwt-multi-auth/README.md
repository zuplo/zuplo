# API Key + JWT Multi-Auth

This example shows how to accept **either** an API key **or** a JWT on the same route, using a composite inbound policy. Requests succeed if either credential is valid; unauthenticated requests get a 401.

This pattern is useful for:

- **Mixed clients**: Server-to-server traffic uses long-lived API keys, while end-user traffic uses short-lived JWTs from your IdP
- **Migration paths**: Onboard JWT-based auth without breaking existing API key consumers
- **Single endpoint, multiple identities**: Resolve `request.user` from whichever credential the caller presented

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).
- An OIDC-compatible IdP (Auth0, Clerk, Cognito, Okta, Supabase, etc.) that issues JWTs and exposes a JWKS endpoint.

## Deploy this example to Zuplo

Click the **Deploy to Zuplo** button anywhere on this page to create a new project in your Zuplo account with this example pre-configured.

After deploy, set the JWT environment variables in your Zuplo project (Settings → Environment Variables):

| Variable | Description |
|----------|-------------|
| `JWT_ISSUER` | Your IdP's issuer URL (e.g. `https://your-tenant.auth0.com/`) |
| `JWT_AUDIENCE` | Expected `aud` claim for tokens issued to this API |
| `JWT_JWKS_URL` | JWKS endpoint your IdP publishes (e.g. `https://your-tenant.auth0.com/.well-known/jwks.json`) |

API keys are managed in the Zuplo portal under **API Key Service** — create a consumer and key there.

## How It Works

A single composite policy (`dual-auth`) runs three inbound policies in order:

1. **`api-key-auth`** — validates `Authorization: Bearer <api-key>`. Sets `request.user` if the key matches a Zuplo-managed consumer. `allowUnauthenticatedRequests: true` lets the request continue to the next policy if no key is present.
2. **`jwt-auth`** — validates a JWT against the configured issuer, audience, and JWKS URL. Sets `request.user` from the token claims. Also runs in `allowUnauthenticatedRequests: true` mode.
3. **`require-auth`** — custom code policy that checks `request.user.sub`. If neither prior policy authenticated the caller, it returns a 401.

Whichever credential matched first populates `request.user`, so handlers don't need to know which auth method was used.

## Project Structure

```
├── config/
│   ├── routes.oas.json         # Single /me route protected by dual-auth
│   └── policies.json           # api-key-auth, jwt-auth, require-auth, dual-auth composite
├── modules/
│   ├── forward-slash-me.ts     # Returns the authenticated user's sub + data
│   └── require-auth.ts         # Gate policy: 401 if request.user.sub missing
└── zuplo.jsonc
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/me` | Returns `sub` and `data` from `request.user` |

## Testing

Replace `YOUR_GATEWAY_URL` with your deployed gateway's URL.

### 1. No credentials → 401

```bash
curl -i https://YOUR_GATEWAY_URL/me
```

### 2. With an API key

```bash
curl -i -H "Authorization: Bearer YOUR_API_KEY" \
  https://YOUR_GATEWAY_URL/me
```

### 3. With a JWT

```bash
curl -i -H "Authorization: Bearer YOUR_JWT" \
  https://YOUR_GATEWAY_URL/me
```

Both authenticated calls return:

```json
{
  "message": "Authenticated",
  "sub": "...",
  "data": { ... }
}
```

## Extending This Example

- **Role-based access**: Inspect `request.user.data` in `require-auth.ts` and reject requests missing required scopes or roles
- **Per-route auth**: Apply `api-key-auth` only to machine routes and `dual-auth` to user-facing routes
- **Additional providers**: Add a second `open-id-jwt-auth-inbound` policy for a second IdP and include it in the composite

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401` with valid JWT | `JWT_ISSUER` / `JWT_AUDIENCE` mismatch | Decode the token at jwt.io and confirm `iss` and `aud` match your env vars exactly (trailing slash matters) |
| `401` with valid API key | Key not provisioned | Create the consumer + key in the Zuplo portal's API Key Service |
| `500` on first request | `JWT_JWKS_URL` unreachable | Verify the JWKS URL returns JSON in a browser |

## Learn More

- [Composite Inbound Policy](https://zuplo.com/docs/policies/composite-inbound)
- [API Key Authentication](https://zuplo.com/docs/policies/api-key-inbound)
- [Open ID JWT Auth](https://zuplo.com/docs/policies/open-id-jwt-auth-inbound)
- [Custom Code Inbound Policy](https://zuplo.com/docs/policies/custom-code-inbound)

# Upstream JWT Auth

This example demonstrates how to use the Zuplo [JWT Service Plugin](https://zuplo.com/docs/programmable-api/jwt-service-plugin) to authenticate requests to an upstream (backend) service using a signed JWT token.

This is useful when your backend requires JWT authentication but your API consumers use a different authentication method (like API keys). Zuplo acts as a translation layer, authenticating incoming requests and then signing a JWT to forward to your backend.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).
- An upstream service that accepts JWT authentication

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli):

```bash
npx create-zuplo-api@latest --example upstream-jwt-auth
```

Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## How It Works

This example uses three key components that work together:

### 1. Runtime Plugin Registration (`modules/zuplo.runtime.ts`)

The `JwtServicePlugin` must be registered when the runtime starts. This plugin handles JWT signing operations.

```typescript
import { RuntimeExtensions, JwtServicePlugin } from "@zuplo/runtime";

export function runtimeInit(runtime: RuntimeExtensions) {
  const jwtService = new JwtServicePlugin();
  runtime.addPlugin(jwtService);
}
```

### 2. Custom Policy (`modules/add-auth-header.ts`)

The policy intercepts incoming requests, signs a JWT with claims from the authenticated user, and adds it to the `Authorization` header before forwarding to the backend.

```typescript
const token = await JwtServicePlugin.signJwt({
  user_id: request.user.sub,
  account_id: request.user.data.accountId,
  ...options.customClaims,
});

headers.set("Authorization", `Bearer ${token}`);
```

### 3. Request Flow

1. Client sends a request (authenticated via API key, OAuth, etc.)
2. Zuplo authenticates the request and populates `request.user`
3. The `add-auth-header` policy signs a JWT with user claims
4. The JWT is added to the `Authorization` header
5. Request is forwarded to the upstream service with the JWT

## Project Structure

```text
├── config/
│   ├── policies.json      # Policy configuration
│   └── routes.oas.json    # Route definitions
└── modules/
    ├── add-auth-header.ts # Policy that signs and adds JWT
    └── zuplo.runtime.ts   # Registers JwtServicePlugin
```

## Configuration

### JWT Claims

The JWT token includes:

- `user_id` - The authenticated user's subject (`request.user.sub`)
- `account_id` - Custom data from user metadata (`request.user.data.accountId`)
- Custom claims from policy options

To customize the claims, modify the `add-auth-header.ts` policy or pass additional claims via policy options in `policies.json`.

### JWT Signing Keys

By default, the JWT Service Plugin uses Zuplo's managed signing keys. For production, you can configure your own keys. See the [JWT Service Plugin documentation](https://zuplo.com/docs/programmable-api/jwt-service-plugin) for details.

## Testing

This example requires an authenticated user. To test locally, you'll need to:

1. Add an authentication policy (e.g., API Key auth) before the `add-auth-header` policy
2. Configure API key consumers with the required metadata

```bash
curl http://localhost:9000/test \
  -H "Authorization: Bearer YOUR_API_KEY"
```

The upstream service (https://echo.zuplo.io) will echo back the request, including the JWT in the `Authorization` header.

## Common Customizations

- **Add more claims**: Modify `add-auth-header.ts` to include additional user data
- **Change signing algorithm**: Configure the JwtServicePlugin with custom options
- **Conditional JWT**: Add logic to only sign JWTs for specific routes or users

## Learn More

- [JWT Service Plugin](https://zuplo.com/docs/programmable-api/jwt-service-plugin)
- [Runtime Extensions](https://zuplo.com/docs/articles/runtime-extensions)
- [Custom Policies](https://zuplo.com/docs/policies/custom-code-inbound)
- [Authentication Overview](https://zuplo.com/docs/articles/api-key-authentication)

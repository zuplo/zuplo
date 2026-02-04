# Canary Routing

This example demonstrates how to implement canary deployments at the API gateway level. It routes a configurable percentage of traffic to a canary backend while the rest goes to production, with support for user allow-lists and explicit header overrides.

This pattern is useful for:

- **Gradual rollouts**: Test new backend versions with a small percentage of traffic before full deployment
- **Beta programs**: Route specific users to canary builds regardless of percentage settings
- **Testing in production**: Use the `x-stage` header to manually test canary backends without affecting other traffic

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).
- A Zuplo project (required for API key authentication)

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli/overview):

```bash
npx create-zuplo-api@latest --example canary-routing
```

Then install dependencies:

```bash
cd canary-routing
npm install
```

Before running the dev server, you need to complete the setup steps below.

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## Setup

### 1. Set Up Environment Variables

This example requires environment variables to configure the backend URLs and canary settings.

**For local development:**

Copy the example environment file:

```bash
cp env.example .env
```

The example includes two mock APIs (powered by [Mockbin](https://mockbin.io)) that work out of the box:

```
API_URL_PRODUCTION=https://9b720748f6564204b6e2e0baa095d779_oas.api.mockbin.io
API_URL_CANARY=https://3e99109e442f4df598c518114b250e0d_oas.api.mockbin.io
CANARY_PERCENTAGE=10
CANARY_USERS=
```

| Variable | Description | Example |
|----------|-------------|---------|
| `API_URL_PRODUCTION` | The production backend URL | `https://api.example.com` |
| `API_URL_CANARY` | The canary backend URL | `https://canary.api.example.com` |
| `CANARY_PERCENTAGE` | Percentage of traffic to route to canary (0-100) | `10` |
| `CANARY_USERS` | Comma-separated list of consumer names to always route to canary | `beta-tester-alice,beta-tester-bob` |

**For deployed projects:**

You must also set these environment variables in the Zuplo Portal:

1. Go to your project in the [Zuplo Portal](https://portal.zuplo.com)
2. Navigate to **Settings → Environment Variables**
3. Add all four environment variables with your configuration

### 2. Set Up the API Key Service

This example uses API key authentication to identify users. This is required for the user allow-list feature and enables all requests to be authenticated.

1. In the [Zuplo Portal](https://portal.zuplo.com), open your project
2. Navigate to **Services → API Key Service**
3. Click **Configure** to create an API key bucket (if you haven't already)

### 3. Link Your Local Environment

To connect your local development environment to Zuplo services (API keys, rate limiting, etc.), run:

```bash
npx zuplo link
```

Follow the prompts to select your account, project, and environment. This creates a `.env.zuplo` file that connects your local gateway to Zuplo's services.

> **Note**: Don't commit `.env.zuplo` or `.env` to version control. These files contain environment-specific configuration.

For more details, see [Connecting to Zuplo Services Locally](https://zuplo.com/docs/articles/local-development-services).

### 4. Create API Keys

Create API key consumers for testing. You'll need at least one API key to make authenticated requests.

1. In the Zuplo Portal, go to **Services → API Key Service**
2. Click **Create Consumer**
3. Enter a name (e.g., `test-user`)
4. Click **Create** and copy the generated API key

#### Setting Up Canary Users (Optional)

To always route specific users to the canary backend, add their consumer names to the `CANARY_USERS` environment variable. The canary routing policy checks if `request.user.sub` (which contains the consumer name) matches any entry in this list.

For example, if you create consumers named `beta-tester-alice@company.xyz` and `beta-tester-bob@company.xyz` and want them to always hit canary:

```
CANARY_USERS=beta-tester-alice@company.xyz,beta-tester-bob@company.xyz
```

When these users make requests with their API keys, they will always be routed to the canary backend, regardless of the percentage setting.

## How It Works

The canary routing policy evaluates each request using the following priority:

```
1. User Allow-List → If user ID is in CANARY_USERS, route to canary
2. Explicit Header  → If x-stage: canary header is present, route to canary
3. Percentage-Based → Hash the session/IP and route to canary if under threshold
4. Default          → Route to production
```

### Sticky Routing

For percentage-based routing, the policy uses consistent hashing to ensure the same client always hits the same backend. This prevents users from being randomly switched between backends on each request.

The hash is calculated from:
1. The `x-session-id` header (if present)
2. The `true-client-ip` header (fallback)
3. A static value "unknown" (if neither is available)

### Routing Decision Flow

```
Request Arrives
      │
      ▼
┌─────────────────────┐
│ Is user in          │──Yes──▶ Route to Canary
│ CANARY_USERS list?  │
└─────────────────────┘
      │ No
      ▼
┌─────────────────────┐
│ Is x-stage header   │──Yes──▶ Route to Canary
│ set to "canary"?    │
└─────────────────────┘
      │ No
      ▼
┌─────────────────────┐
│ Is hash < CANARY_   │──Yes──▶ Route to Canary
│ PERCENTAGE?         │
└─────────────────────┘
      │ No
      ▼
   Route to Production
```

## Project Structure

```
├── config/
│   ├── routes.oas.json    # OpenAPI spec with route definitions
│   └── policies.json      # Policy configuration
├── modules/
│   └── canary-routing.ts  # Custom policy implementing the routing logic
├── docs/                  # Zudoku documentation portal
├── env.example            # Example environment variables
├── .env.zuplo             # Generated by `zuplo link` (do not commit)
└── zuplo.jsonc            # Zuplo project metadata
```

**Key files to explore:**

- **`modules/canary-routing.ts`**: The custom inbound policy that determines which backend to route to based on user, header, or percentage.
- **`config/routes.oas.json`**: Defines the API routes using OpenAPI format. Each route uses the URL Rewrite handler with `${context.custom.backendUrl}` to dynamically select the backend.
- **`config/policies.json`**: Configures the API key authentication and canary routing policies.

## API Endpoints

This example exposes a simple payments API to demonstrate the routing:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/balance` | Retrieve account balance |
| `POST` | `/v1/charges` | Create a new charge |
| `GET` | `/v1/charges/{chargeId}` | Retrieve a charge by ID |

## Running the Example

Start the API Gateway:

```bash
npm run dev
```

The server will start on `http://localhost:9000`.

## Testing the Routing

All requests require an API key. Replace `YOUR_API_KEY` with the key you created in step 4.

### Testing with the x-stage Header

The easiest way to test canary routing is using the explicit header:

```bash
# Route to production (default)
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer YOUR_API_KEY"

# Route to canary via header
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "x-stage: canary"
```

With the included mock APIs, you can verify routing by checking the `livemode` field in the response:
- **Production backend**: Returns `"livemode": true`
- **Canary backend**: Returns `"livemode": false`

### Testing Percentage-Based Routing

To test percentage-based routing, set `CANARY_PERCENTAGE` to a value like `50` and make requests with different session IDs:

```bash
# Each unique session ID will consistently route to either canary or production
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "x-session-id: user-session-123"

curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "x-session-id: user-session-456"
```

### Testing User Allow-List Routing

If you've added consumer names to `CANARY_USERS`, those users will always be routed to canary.

For example, if you created a consumer named `beta-tester-alice@company.xyz` and set `CANARY_USERS=beta-tester-alice@company.xyz`:

```bash
# This user's consumer name is in CANARY_USERS → always routes to canary
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer BETA_TESTER_ALICE_API_KEY"

# This user's consumer name is NOT in CANARY_USERS → routes based on percentage
curl http://localhost:9000/v1/balance \
  -H "Authorization: Bearer REGULAR_USER_API_KEY"
```

The canary routing policy checks if `request.user.sub` (the consumer name from the API key) matches any entry in the `CANARY_USERS` list.

## Extending This Example

- **Multiple canary tiers**: Extend the policy to support multiple canary environments (e.g., alpha, beta, canary)
- **Feature flags**: Combine with feature flag metadata to enable canary routing per-feature
- **Metrics and logging**: Add custom metrics to track canary vs production traffic ratios
- **Automatic rollback**: Integrate with error rate monitoring to automatically disable canary routing if errors spike
- **JWT authentication**: Replace API key auth with JWT to use claims for user identification

## Troubleshooting

If requests aren't routing correctly or you're getting errors, work through this checklist:

- [ ] Created a Zuplo project in the portal
- [ ] Configured the API Key Service in **Services → API Key Service**
- [ ] Ran `npx zuplo link` and selected your project/environment
- [ ] Created at least one API key consumer
- [ ] Copied `env.example` to `.env` (mock backend URLs are included)
- [ ] Started the dev server with `npm run dev`

**Common errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Missing or invalid API key | Check you're passing the `Authorization: Bearer` header with a valid key |
| Requests always go to production | `CANARY_PERCENTAGE` is 0 or not set | Set a percentage value or use the `x-stage: canary` header |
| `API_URL_CANARY not configured` warning in logs | Canary URL not set | Add `API_URL_CANARY` to your `.env` file |
| Inconsistent routing | Missing session/IP identifier | Ensure requests include `x-session-id` or come from identifiable IPs |
| User allow-list not working | Consumer name mismatch | Verify the API key consumer's name exactly matches an entry in `CANARY_USERS` (e.g., if consumer is named `beta-tester-alice`, use `CANARY_USERS=beta-tester-alice`) |
| API Key Service errors | Not linked to Zuplo | Run `npx zuplo link` and select your project |

## Learn More

- [Custom Code Inbound Policy](https://zuplo.com/docs/policies/custom-code-inbound)
- [URL Rewrite Handler](https://zuplo.com/docs/handlers/url-rewrite)
- [Environment Variables](https://zuplo.com/docs/articles/environment-variables)
- [API Key Authentication](https://zuplo.com/docs/policies/api-key-inbound)

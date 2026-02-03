# Dynamic Rate Limiting

This example demonstrates how to apply different rate limits to the same API route based on metadata in a user's API key. This is a common pattern for tiered API access, where premium customers get higher limits than free-tier users.

This pattern is useful for:

- **Tiered pricing**: Apply different rate limits based on subscription level (free, pro, enterprise)
- **Usage-based billing**: Allocate request quotas based on customer plan
- **Fair usage**: Ensure heavy users don't impact service quality for others

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli/overview):

```bash
npx create-zuplo-api@latest --example dynamic-rate-limits
```

Then install dependencies:

```bash
cd dynamic-rate-limits
npm install
```

Before running the dev server, you need to complete the setup steps below.

### Deploy to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## Setup

### 1. Set Up the API Key Service

To use API key authentication locally, you need to connect to Zuplo's API Key Service.

1. In the [Zuplo Portal](https://portal.zuplo.com), open your project
2. Navigate to **Services → API Key Service**
3. Click **Configure** to create an API key bucket (if you haven't already)

### 2. Link Your Local Environment

To connect your local development environment to Zuplo services (API keys, rate limiting, etc.), run:

```bash
npx zuplo link
```

Follow the prompts to select your account, project, and environment. This creates a `.env.zuplo` file that connects your local gateway to Zuplo's services.

> **Note**: Don't commit `.env.zuplo` or `.env` to version control. These files contain environment-specific configuration.

For more details, see [Connecting to Zuplo Services Locally](https://zuplo.com/docs/articles/local-development-services).

### 3. Create API Keys

Create API keys with different customer type metadata to test the rate limiting behavior:

1. In the Zuplo Portal, go to **Services → API Key Service**
2. Click **Create Consumer**
3. Enter a name (e.g., "Premium User")
4. In the **Metadata** field, enter:
   ```json
   {
     "customerType": "premium"
   }
   ```
5. Click **Create** and copy the generated API key

Repeat the process to create a free-tier key with this metadata:

```json
{
  "customerType": "free"
}
```

You should now have two API keys with different rate limits:

| Customer Type | Rate Limit |
|---------------|------------|
| `premium` | 1000 requests/minute |
| `free` | 5 requests/minute |
| (default) | 30 requests/minute |

## How It Works

When a request is authenticated using Zuplo's API Key Authentication, user information becomes available on `request.user`. This includes any metadata you've attached to the API key.

The rate limiting policy uses a custom function to determine the rate limit dynamically:

1. The `rate-limit-inbound` policy is configured with `rateLimitBy: "function"`
2. The function reads `request.user.data.customerType` from the API key's metadata
3. Based on the customer type, it returns different rate limit configurations
4. Zuplo enforces the appropriate limit for each user

This means a single API endpoint can apply completely different rate limits depending on who is calling it.

**Key files to explore:**

- **`modules/dynamic-rate-limiter.ts`**: The custom function that reads API key metadata and returns rate limit configuration based on the customer type.
- **`config/routes.oas.json`**: Defines the API routes using OpenAPI format. Each route uses both API key authentication and rate limiting policies.
- **`config/policies.json`**: Configures the API key authentication and rate limiting policies, including the reference to the custom rate limit function.

## Running the Example

Start the API Gateway:

```bash
npm run dev
```

The server will start on `http://localhost:9000`.

## Testing the Rate Limiting

Use curl to test with different API keys. You'll see the rate limit headers in each response.

### Request with Premium Key

```bash
curl -i http://localhost:9000/todos \
  -H "Authorization: Bearer YOUR_PREMIUM_API_KEY"
```

Check the response headers:

```
ratelimit-limit: 1000
ratelimit-remaining: 999
ratelimit-reset: 60
```

### Request with Free Key

```bash
curl -i http://localhost:9000/todos \
  -H "Authorization: Bearer YOUR_FREE_API_KEY"
```

Check the response headers:

```
ratelimit-limit: 5
ratelimit-remaining: 4
ratelimit-reset: 60
```

### Exceeding the Rate Limit

With a free-tier key (5 requests/minute), quickly make several requests to see rate limiting in action.

The first 5 requests will return `200`, and the 6th will return `429 Too Many Requests`.

## Extending This Example

- **Add more tiers**: Extend the function to support additional customer types like `enterprise` or `trial`
- **Time-based limits**: Use different time windows (e.g., hourly limits for enterprise, minute limits for free)
- **Endpoint-specific limits**: Apply different limits to different endpoints based on their resource intensity
- **Dynamic configuration**: Load rate limit values from environment variables or an external service

### Example: Adding an Enterprise Tier

```typescript
// In modules/dynamic-rate-limiter.ts
if (user.data.customerType === "enterprise") {
  return {
    key: user.sub,
    requestsAllowed: 10000,
    timeWindowMinutes: 1,
  };
}
```

Then create an API key with metadata `{"customerType": "enterprise"}`.

## Troubleshooting

If requests aren't being rate limited correctly or you're getting errors, work through this checklist:

- [ ] Created a Zuplo project in the portal
- [ ] Configured the API Key Service in **Services → API Key Service**
- [ ] Ran `npx zuplo link` and selected your project/environment
- [ ] Created a premium API key with metadata `{"customerType": "premium"}`
- [ ] Created a free API key with metadata `{"customerType": "free"}`
- [ ] Started the dev server with `npm run dev`

**Common errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Missing or invalid API key | Check you're passing the `Authorization: Bearer` header with a valid key |
| `429 Too Many Requests` | Rate limit exceeded | Wait for the time window to reset, or use a key with higher limits |
| Rate limit headers show wrong values | API key metadata missing or incorrect | Verify the key has `{"customerType": "premium"}` or `{"customerType": "free"}` in its metadata |
| API Key Service error | Not linked | Run `npx zuplo link` |

## Learn More

- [Rate Limiting](https://zuplo.com/docs/policies/rate-limit-inbound)
- [Custom Rate Limit Functions](https://zuplo.com/docs/policies/rate-limit-inbound#custom-function)
- [API Key Authentication](https://zuplo.com/docs/policies/api-key-inbound)
- [Custom Code Inbound Policy](https://zuplo.com/docs/policies/custom-code-inbound)

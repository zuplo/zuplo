# Basic API Gateway

This example demonstrates how to build a production-ready API gateway with Zuplo. It showcases the core features you need to protect and manage an API: authentication, rate limiting, request validation, and request size limits, all configured declaratively without writing code.

The gateway proxies a sample Todo API, demonstrating how Zuplo sits in front of your backend to add security and control.

## What You'll Learn

By working through this example, you'll understand how to:

- Set up API key authentication to control access to your API
- Configure rate limiting to protect your backend from abuse
- Validate incoming requests against a JSON schema
- Limit request body size to prevent oversized payloads
- Forward requests to an upstream backend API

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup?utm_source=basic-api-gateway-example&ref=basic-api-gateway-example).

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli/overview):

```bash
npx create-zuplo-api@latest --example basic-api-gateway
```

Then install dependencies and start the development server:

```bash
cd basic-api-gateway
npm install
npm run dev
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

### Setting Up API Keys

This example uses API key authentication. When running locally, you can test with any value for the API key (local development doesn't validate keys against a real bucket). However, when testing a deployed project, you'll need a real API key. Follow these steps:

> **Local Testing**: When running locally with `npm run dev`, you can use any string as the API key (e.g., `test-key`). The local environment doesn't connect to the API Key Service.

For deployed projects, create a real API key:

1. **Create an API Key Bucket** (if you don't have one already)
   - In the Zuplo Portal, navigate to **Services → API Key Service**
   - Click **Configure** to create a new API key bucket for your project

2. **Create a Consumer**
   - In the API Key Service, click **Create Consumer**
   - Enter a name for the consumer (e.g., "Test User")
   - Optionally add metadata like an email address
   - Click **Create**

3. **Get Your API Key**
   - After creating the consumer, click on them to view their details
   - Copy the API key value (it will look something like `zpka_d67b7e241bb948758f415b79aa8exxxx_2efbxxxx`)
   - Use this key in the `Authorization: Bearer YOUR_API_KEY` header when making requests

> **Tip**: You can also manage API keys programmatically using the [Zuplo API](https://zuplo.com/docs/api/api-keys-consumers).

## How This Example Works

This example creates an API gateway that proxies requests to a backend Todo API (`https://todo.zuplo.io`) while applying several policies to each request:

1. **API Key Authentication**: Validates the `Authorization` header contains a valid API key
2. **Rate Limiting**: Limits requests to 2 per minute per authenticated user
3. **Request Validation**: Validates request bodies against JSON schemas defined in the OpenAPI spec
4. **Request Size Limit**: Rejects requests with bodies larger than 1000 bytes

All requests pass through these policies before being forwarded to the upstream backend.

## Why These Policies?

These four policies represent the foundation of a secure, production-ready API. Here's why each one matters:

### API Key Authentication

API keys are the most common way to authenticate API consumers. They allow you to:

- **Identify who is calling your API** so you can track usage, apply rate limits per consumer, and revoke access when needed
- **Monetize your API** by tying keys to billing plans or usage tiers
- **Control access** by enabling or disabling keys without changing your backend

In this example, every request must include a valid API key. Unauthenticated requests are rejected before they ever reach your backend.

### Rate Limiting

Rate limiting protects your API from abuse and ensures fair usage across all consumers. Without it:

- A single consumer could overwhelm your backend with requests
- Malicious actors could launch denial-of-service attacks
- Costs could spiral out of control from unexpected traffic spikes

This example limits each authenticated user to 2 requests per minute (intentionally low for easy testing). In production, you'd typically set higher limits based on your API's capacity and pricing tiers.

### Request Validation

Validating requests at the gateway catches malformed data before it reaches your backend. This:

- **Reduces backend load** by rejecting invalid requests early
- **Improves security** by ensuring only well-formed data gets through
- **Provides better error messages** to API consumers about what's wrong with their request

This example validates request bodies against the JSON schemas defined in the OpenAPI spec, rejecting requests that don't match the expected structure.

### Request Size Limit

Limiting request body size prevents large payloads from consuming excessive resources. This protects against:

- **Memory exhaustion** from processing massive request bodies
- **Denial-of-service attacks** using oversized payloads
- **Unexpected costs** from processing and storing large amounts of data

This example limits request bodies to 1000 bytes. Adjust this based on your API's legitimate use cases.

## Project Structure

```
├── config/
│   ├── routes.oas.json    # OpenAPI spec with route definitions and policies
│   └── policies.json      # Policy configuration (rate limits, auth settings, etc.)
├── docs/                  # Developer portal configuration (Zudoku)
│   ├── zudoku.config.tsx  # Portal configuration
│   └── pages/             # Documentation pages
├── modules/
│   └── hello-world.ts     # Example custom handler (not used in this example)
├── env.example            # Example environment variables
└── zuplo.jsonc            # Zuplo project configuration
```

**Key files to explore:**

- **`config/routes.oas.json`** - This is where your API routes are defined using OpenAPI format. Each route specifies which policies to apply and how to handle requests.
- **`config/policies.json`** - Contains the configuration for all policies (authentication, rate limiting, etc.). Modify this file to adjust policy behavior.
- **`modules/hello-world.ts`** - An example of a custom request handler. This example doesn't use it (routes forward to an external API instead), but it shows how you can write custom TypeScript logic.

## API Endpoints

The gateway exposes the following endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/todos` | Retrieve all todo items |
| `POST` | `/todos` | Create a new todo item |
| `PUT` | `/todos/{id}` | Update an existing todo |
| `DELETE` | `/todos/{id}` | Delete a todo |

## Key Policy Options to Experiment With

| Policy | Option | Description |
|--------|--------|-------------|
| **API Key** | `allowUnauthenticatedRequests` | When `false`, rejects requests without valid API keys |
| **API Key** | `cacheTtlSeconds` | How long to cache API key validation results |
| **Rate Limit** | `rateLimitBy` | Rate limit per `user`, `ip`, or `function` |
| **Rate Limit** | `requestsAllowed` | Maximum requests allowed in the time window |
| **Rate Limit** | `timeWindowMinutes` | Time window for rate limiting |
| **Request Validation** | `validateBody` | How to handle invalid bodies: `reject-and-log`, `log-only`, or `none` |
| **Request Size Limit** | `maxSizeInBytes` | Maximum allowed request body size |

## Running the Example

If you haven't already, start the API Gateway:

```bash
npm run dev
```

The server will start on `http://localhost:9000`. You should see output indicating the server is ready.

> **Deployed projects**: If you deployed to Zuplo, your API will be available at a URL like `https://your-project-name.zuplo.dev`. You can find this URL in the Zuplo Portal.

## Testing the API

Use curl to test the API. For local testing, you can use any value for the API key. For deployed projects, use a real API key from your API Key Service.

```bash
curl http://localhost:9000/todos \
  -H "Authorization: Bearer test-key"
```

Expected response (200 OK):

```json
[
  {"id": 1, "title": "Buy groceries", "completed": false, "userId": 123},
  {"id": 2, "title": "Write documentation", "completed": true, "userId": 456}
]
```

## Testing the Policies

### Authentication

Try making a request without an API key to see authentication in action:

```bash
curl http://localhost:9000/todos
```

Expected response (401 Unauthorized):

```json
{"type":"https://httpproblems.com/http-status/401","title":"Unauthorized","status":401,"detail":"No authorization header was found"}
```

### Rate Limiting

Send more than 2 requests within a minute to see rate limiting in action:

```bash
# These should succeed (requests 1 and 2)
curl http://localhost:9000/todos -H "Authorization: Bearer test-key"
curl http://localhost:9000/todos -H "Authorization: Bearer test-key"

# This should return 429 Too Many Requests (request 3)
curl http://localhost:9000/todos -H "Authorization: Bearer test-key"
```

Expected response on the third request (429 Too Many Requests):

```json
{"type":"https://httpproblems.com/http-status/429","title":"Too Many Requests","status":429,"detail":"Rate limit exceeded"}
```

> **Tip**: Wait 60 seconds for the rate limit to reset, or use a different API key value to test again.

### Request Validation

Send an invalid request body to see validation errors:

```bash
# Missing required field "userId"
curl -X POST http://localhost:9000/todos \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{"title": "Invalid todo"}'
```

Expected response (400 Bad Request):

```json
{"type":"https://httpproblems.com/http-status/400","title":"Bad Request","status":400,"detail":"Body schema validation failed","errors":[{"path":"userId","message":"Required"}]}
```

### Request Size Limit

Send a request body larger than 1000 bytes to see the size limit in action:

```bash
# This creates a request body larger than the 1000 byte limit
curl -X POST http://localhost:9000/todos \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{"title": "This is a very long title that we are using to test the request size limit policy. We need to make this string long enough to exceed 1000 bytes which is the configured limit for this example. Adding more text here to ensure we go over the limit. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. More text to push us over the edge of the limit. This should definitely be enough now to trigger the policy and return an error response to the client.", "userId": 1}'
```

Expected response (413 Payload Too Large):

```json
{"type":"https://httpproblems.com/http-status/413","title":"Payload Too Large","status":413,"detail":"Request body is too large"}
```

## Extending This Example

Here are some ways to extend this basic gateway:

- **Connect your own backend**: Replace `https://todo.zuplo.io` with your API URL in `routes.oas.json`
- **Customize rate limits**: Adjust limits per endpoint or use [dynamic rate limiting](https://zuplo.com/docs/policies/rate-limit-inbound#custom-rate-limiting)
- **Add custom logic**: Create [custom handlers](https://zuplo.com/docs/handlers/custom-handler) or [custom policies](https://zuplo.com/docs/policies/custom-code-inbound)

## Learn More

- [Zuplo Documentation](https://zuplo.com/docs)
- [API Key Authentication](https://zuplo.com/docs/policies/api-key-inbound)
- [Rate Limiting](https://zuplo.com/docs/policies/rate-limit-inbound)
- [Request Validation](https://zuplo.com/docs/policies/request-validation-inbound)
- [Request Size Limit](https://zuplo.com/docs/policies/request-size-limit-inbound)
- [URL Forward Handler](https://zuplo.com/docs/handlers/url-forward)

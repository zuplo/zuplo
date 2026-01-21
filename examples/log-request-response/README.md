# Log Request & Response

This example demonstrates how to capture the full request and response for every API call and send the data to your logging provider. This is useful for debugging, auditing, and monitoring API traffic.

The example uses the [OnResponseSendingFinal](https://zuplo.com/docs/articles/runtime-extensions#hooks-onresponsesendingfinal) hook in `zuplo.runtime.ts` to register a global logging handler that runs after every response.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli):

```bash
npx create-zuplo-api@latest --example log-request-response
```

Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## How It Works

### Runtime Hook Registration

The `zuplo.runtime.ts` file registers a hook that runs after every response is sent:

```typescript
import { RuntimeExtensions } from "@zuplo/runtime";

export function runtimeInit(runtime: RuntimeExtensions) {
  runtime.addResponseSendingFinalHook(async (response, request, context) => {
    // Logging logic here
  });
}
```

### What Gets Logged

The hook captures:

- **Request**: URL, headers (excluding sensitive ones like `authorization`), and body
- **Response**: Status code, headers, and body
- **Route**: The matched route pattern from `context.route.pathPattern`

```typescript
const entry = {
  requestHeaders,
  requestUrl: request.url,
  route: context.route.pathPattern,
  requestBody,
  responseStatus: response.status,
  responseHeaders,
  responseBody,
};

context.log.info(entry);
```

### Header Filtering

Sensitive headers like `authorization` are filtered out before logging:

```typescript
for (const [name, value] of request.headers) {
  if (name !== "authorization") {
    requestHeaders[name] = value;
  }
}
```

## Project Structure

```text
├── config/
│   └── routes.oas.json      # Route definitions
└── modules/
    ├── hello-world.ts       # Sample handler
    └── zuplo.runtime.ts     # Global logging hook
```

## Testing the Example

Make a request and check the logs:

```bash
curl http://localhost:9000/test
```

In the Zuplo logs (or your terminal when running locally), you'll see output like:

```json
{
  "requestHeaders": {
    "host": "localhost:9000",
    "user-agent": "curl/8.1.2",
    "accept": "*/*"
  },
  "requestUrl": "http://localhost:9000/test",
  "route": "/test",
  "requestBody": null,
  "responseStatus": 200,
  "responseHeaders": {
    "content-type": "application/json"
  },
  "responseBody": "{\"message\":\"Hello, world!\"}"
}
```

## Common Customizations

- **Add more header filters**: Extend the filtering logic to exclude other sensitive headers like `cookie` or custom auth headers
- **Limit body size**: Truncate large request/response bodies to avoid log bloat
- **Send to external service**: Replace `context.log.info()` with a fetch call to your logging provider (Datadog, Splunk, etc.)
- **Conditional logging**: Only log certain routes or response status codes
- **Add timing data**: Include request duration using `Date.now()` at the start and end

## Integrating with Log Providers

To send logs to an external service, replace the `context.log.info()` call:

```typescript
await fetch("https://your-log-provider.com/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(entry),
});
```

For production, consider using Zuplo's built-in [log plugins](https://zuplo.com/docs/articles/log-plugins) which provide pre-built integrations with popular logging services.

## Learn More

- [Runtime Extensions](https://zuplo.com/docs/articles/runtime-extensions)
- [Log Plugins](https://zuplo.com/docs/articles/log-plugins)
- [Context Logging](https://zuplo.com/docs/articles/context-logging)

# Mocking & Unit Testing

This example demonstrates how to write unit tests for Zuplo handlers by mocking `ZuploRequest` and `ZuploContext`. The sample uses [Mocha](https://mochajs.org/) and [Sinon](https://sinonjs.org/) for testing and mocking, but the concepts apply to any test framework.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).
- Node.js installed locally for running tests

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli):

```bash
npx create-zuplo-api@latest --example test-mocks
```

Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

### Running the Tests

To run the unit tests:

```bash
npm run unit
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## How It Works

### Mocking ZuploRequest

Since `ZuploRequest` extends the standard `Request` class, you can create a mock by extending `Request` and adding the Zuplo-specific properties:

```typescript
class ZuploRequest extends Request {
  params: Record<string, string>;

  constructor(input: string | Request, init?: RequestInit & { params?: Record<string, string> }) {
    super(input, init);
    this.params = init?.params || {};
  }
}
```

### Mocking ZuploContext

Create a mock context object with the properties your handlers use:

```typescript
export const context = {
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  route: {
    pathPattern: "/test",
  },
  // Add other properties as needed
};
```

### Testing Handlers

With the mocks in place, you can test handlers directly:

```typescript
it("Calls the handler and validates the result", async function () {
  const contextSpy = sandbox.spy(context.log, "info");

  const mockRequest = new ZuploRequest("https://test.com", {
    method: 'POST',
    body: JSON.stringify({ hello: "world" })
  });

  const response = await handler1(mockRequest, context);
  const result = await response.json();

  assert(contextSpy.calledOnce);
  assert(result.hello === "world");
});
```

### Mocking External API Calls

Use [undici's MockAgent](https://zuplo.link/undici-mock) to mock fetch calls your handlers make:

```typescript
import { MockAgent, setGlobalDispatcher } from "undici";

const mockAgent = new MockAgent();
setGlobalDispatcher(mockAgent);

const mockPool = mockAgent.get("https://echo.zuplo.io");
mockPool
  .intercept({ path: "/hello" })
  .reply(200, { data: "mocked response" });
```

## Project Structure

```text
├── config/
│   └── routes.oas.json      # Route definitions
├── modules/
│   ├── handler1.ts          # Handler that logs and returns body
│   └── handler2.ts          # Handler that makes external API call
└── unit-tests/
    ├── mocks.ts             # Mock implementations
    └── handlers.spec.ts     # Test file
```

## Test Examples

### Testing a Simple Handler

```typescript
it("Calls the handler and validates the result", async function () {
  const mockRequest = new ZuploRequest("https://test.com", {
    method: 'POST',
    body: JSON.stringify({ hello: "world" })
  });

  const response = await handler1(mockRequest, context);
  const result = await response.json();

  assert(result.hello === "world");
});
```

### Testing with Path Parameters

```typescript
it("Handles path parameters", async function () {
  const mockRequest = new ZuploRequest("https://my-api.zuplo.app", {
    params: { param1: "hello" },
  });

  const result = await handler2(mockRequest, context);
  assert(result.data === "expected value");
});
```

### Using Sinon Spies

```typescript
it("Verifies logging was called", async function () {
  const logSpy = sandbox.spy(context.log, "info");

  await handler1(mockRequest, context);

  assert(logSpy.calledOnce);
  assert(logSpy.calledWith({ hello: "world" }));
});
```

## Common Customizations

- **Add more mock properties**: Extend the mock context with `request.user`, `context.custom`, etc.
- **Test policies**: Apply the same mocking approach to test custom policies
- **Test error cases**: Verify handlers return appropriate error responses
- **Integration tests**: Use Zuplo's test framework for end-to-end testing

## Learn More

- [Testing in Zuplo](https://zuplo.com/docs/articles/testing)
- [Mocha Documentation](https://mochajs.org/)
- [Sinon Documentation](https://sinonjs.org/)
- [Undici MockAgent](https://github.com/nodejs/undici/blob/main/docs/api/MockAgent.md)

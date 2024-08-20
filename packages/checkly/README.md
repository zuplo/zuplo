# Zuplo Checkly Utilities

A simple wrapper utility for Checkly API tests that makes it easier to write and manage tests.

The key change here is that the utility allows writing tests using fetch API standard objects (Request, Headers, etc.) rather than using key/value pairs.

## Installation

```bash
npm install @zuplo/checkly
```

## Usage

The library outputs two functions: `check` and `asserts`.

```typescript
import { asserts, check } from "@zuplo/checkly";
```

The `check` function is similar to the Checkly `ApiChecks` construct, but uses a modified version of `ApiCheckProps` object that uses fetch API standard objects.

The object is structured as follows:

```typescript
Omit<ApiCheckProps, "request"> & {
  request: Omit<RequestInit, "body"> & { url: string; body?: string };
  assertions: Assertion[] | undefined;
}
```

The `asserts` function is just an alias to Checkly's `AssertionBuilder` class.

The `url` property in the `request` object is the only required property and must be a relative path. The value of `ENVIRONMENT_URL` will be prepended to the path when the check is run.

## Examples

### Basic check

```typescript
import { asserts, check } from "@zuplo/checkly";

check({
  name: "Should return okay",
  request: {
    url: "/hello-world",
  },
  assertions: [asserts().statusCode().equals(200)],
});
```

### Check with Headers

```typescript
import { asserts, check } from "@zuplo/checkly";

check({
  name: "Should send headers",
  request: {
    url: "/hello-world",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer token",
    },
  },
  assertions: [asserts().statusCode().equals(200)],
});
```

### Check with Body

```typescript
import { asserts, check } from "@zuplo/checkly";

check({
  name: "Should send a body",
  request: {
    url: "/hello-world",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key: "value" }),
  },
  assertions: [asserts().statusCode().equals(200)],
});
```

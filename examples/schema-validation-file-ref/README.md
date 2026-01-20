# Schema Validation with File References

This example demonstrates how to use the [Request Validation](https://zuplo.com/docs/policies/request-validation-inbound) policy with OpenAPI schemas stored in external files using `$ref`. This pattern keeps your route definitions clean and allows you to reuse schemas across multiple endpoints.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli):

```bash
npx create-zuplo-api@latest --example schema-validation-file-ref
```

Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## How It Works

### External Schema References

Instead of defining schemas inline in your OpenAPI document, you can reference external JSON Schema files:

```json
{
  "requestBody": {
    "content": {
      "application/json": {
        "schema": {
          "$ref": "../schemas/insert-todo-object.json"
        }
      }
    }
  }
}
```

### Request Validation Policy

The `request-validation-inbound` policy automatically validates incoming requests against the referenced schemas:

```json
{
  "handler": {
    "export": "RequestValidationInboundPolicy",
    "module": "$import(@zuplo/runtime)",
    "options": {
      "validateBody": "reject-and-log",
      "validatePathParameters": "none",
      "validateQueryParameters": "none"
    }
  }
}
```

When validation fails, the policy returns a 400 Bad Request with details about what failed.

## Project Structure

```text
├── config/
│   ├── policies.json        # Policy configurations
│   └── routes.oas.json      # Route definitions with $ref to schemas
└── schemas/
    ├── insert-todo-object.json      # Schema for creating todos
    ├── todo-object.json             # Schema for todo response
    └── schema-validation-error.json # Schema for validation errors
```

## Schema Example

The `insert-todo-object.json` schema defines the required fields for creating a todo:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["userId", "title", "completed"],
  "additionalProperties": false,
  "properties": {
    "userId": { "type": "integer" },
    "title": { "type": "string" },
    "completed": { "type": "boolean" }
  }
}
```

## Testing the Example

### Valid Request

```bash
curl -X POST http://localhost:9000/v1/todos \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "title": "Wash the dishes", "completed": false}'
```

### Invalid Request (missing required field)

```bash
curl -X POST http://localhost:9000/v1/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Wash the dishes"}'
```

This returns a 400 error with validation details:

```json
{
  "type": "https://httpproblems.com/http-status/400",
  "title": "Bad Request",
  "status": 400,
  "detail": "Incoming request body did not pass schema validation",
  "errors": [
    {
      "path": "",
      "message": "must have required property 'userId'"
    }
  ]
}
```

## Validation Options

| Option | Values | Description |
|--------|--------|-------------|
| `validateBody` | `reject-and-log`, `log-only`, `none` | How to handle body validation failures |
| `validatePathParameters` | `reject-and-log`, `log-only`, `none` | How to handle path parameter validation |
| `validateQueryParameters` | `reject-and-log`, `log-only`, `none` | How to handle query parameter validation |

## Common Customizations

- **Add more schemas**: Create new `.json` files in the `schemas/` directory and reference them with `$ref`
- **Reuse schemas**: Reference the same schema file from multiple endpoints
- **Nested schemas**: Use `$ref` within schemas to reference other schemas
- **Change validation behavior**: Set to `log-only` during development to see validation errors without rejecting requests

## Learn More

- [Request Validation Policy](https://zuplo.com/docs/policies/request-validation-inbound)
- [OpenAPI Schema Validation](https://zuplo.com/docs/articles/open-api-validation)
- [JSON Schema Reference](https://json-schema.org/understanding-json-schema/)

# API Linting with Vacuum

This example demonstrates how to lint your Zuplo API using [Vacuum](https://quobix.com/vacuum/), an OpenAPI linter. It includes both built-in OpenAPI rules and custom rules specific to Zuplo projects, such as requiring certain policies on all routes.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).
- Node.js installed locally

## Working with this Example

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the [Zuplo CLI](https://zuplo.com/docs/cli):

```bash
npx create-zuplo-api@latest --example api-linting
```

Then, in the project directory run the following commands:

```bash
npm install
npm run lint
```

### Deploy this example to Zuplo

It is also possible to deploy this example directly to your Zuplo account and work with it via the Zuplo Portal. You can do this by clicking the **Deploy to Zuplo** button anywhere on this page.

## How It Works

### Ruleset Configuration

The linting rules are defined in `config/api-ruleset.yaml`. This file configures both standard OpenAPI rules and custom Zuplo-specific rules.

### Built-in Rules

Standard OpenAPI validation rules can be enabled:

```yaml
rules:
  oas3-schema: true
  oas3-api-servers: false
  oas3-unused-component: false
```

### Custom Zuplo Rules

This example includes custom rules that enforce Zuplo-specific requirements:

#### 1. Valid Path Mode

Ensures `x-zuplo-path.pathMode` is either `open-api` or `url-pattern`:

```yaml
zuplo-valid-path-mode:
  description: Zuplo pathMode must be 'open-api' or 'url-pattern'
  given: $.paths.*.x-zuplo-path
  severity: error
  then:
    field: pathMode
    function: pattern
    functionOptions:
      match: "^(open-api|url-pattern)$"
```

#### 2. Required Route Configuration

Ensures all operations have `x-zuplo-route` with required properties:

```yaml
zuplo-route-required-properties:
  description: Zuplo route must have required properties
  given: "$.paths[*]['get','put','post','delete','options','head','patch','trace'].x-zuplo-route"
  severity: error
  then:
    - field: corsPolicy
      function: truthy
    - field: handler
      function: truthy
    - field: policies
      function: truthy
```

#### 3. Required Policy

Ensures all routes have a specific policy (e.g., authentication):

```yaml
zuplo-require-policy:
  description: Require all routes have a specific zuplo policy
  severity: error
  given: "$.paths[*]['get','put','post','delete','options','head','patch','trace'].x-zuplo-route.policies.inbound"
  then:
    function: zuploRequiredPolicy
    functionOptions:
      policyName: "my-auth-policy"
```

#### 4. Path Prefix

Ensures all paths start with a specific value (e.g., `/v1`):

```yaml
path-starts-with:
  description: Require all paths to start with a specific value
  severity: error
  given: "$.paths"
  then:
    function: pathStartsWithPolicy
    functionOptions:
      startsWith: "/v1"
```

## Project Structure

```text
├── config/
│   ├── api-ruleset.yaml     # Linting rules configuration
│   ├── policies.json        # Policy configurations
│   └── routes.oas.json      # Route definitions to lint
└── lint-functions/
    ├── zuploRequiredPolicy.js   # Custom function: require specific policy
    └── pathStartsWithPolicy.js  # Custom function: validate path prefix
```

## Running the Linter

Run the linter against your routes:

```bash
npm run lint
```

Example output when rules fail:

```text
ERROR: zuplo-require-policy - Require all routes have a specific zuplo policy
  at $.paths./v1/todos.post.x-zuplo-route.policies.inbound

ERROR: path-starts-with - Require all paths to start with a specific value
  at $.paths./users
```

## Customizing Rules

### Change Required Policy Name

Edit `config/api-ruleset.yaml`:

```yaml
zuplo-require-policy:
  then:
    function: zuploRequiredPolicy
    functionOptions:
      policyName: "api-key-auth"  # Change to your policy name
```

### Change Required Path Prefix

```yaml
path-starts-with:
  then:
    function: pathStartsWithPolicy
    functionOptions:
      startsWith: "/api/v2"  # Change to your prefix
```

### Add More Custom Functions

Create a new JavaScript file in `lint-functions/` and reference it in your ruleset:

```javascript
// lint-functions/myCustomRule.js
export default function (input, options) {
  // Return array of errors, or empty array if valid
  return [];
}
```

## CI/CD Integration

Add linting to your CI pipeline to catch issues before deployment:

```yaml
# GitHub Actions example
- name: Lint API
  run: npm run lint
```

## Learn More

- [Vacuum Documentation](https://quobix.com/vacuum/)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- [Zuplo OpenAPI Extensions](https://zuplo.com/docs/articles/open-api)

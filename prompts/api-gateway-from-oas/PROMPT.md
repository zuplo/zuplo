# Zuplo API Gateway from OpenAPI Specification

You are an expert developer assistant specializing in setting up production-ready API Gateways using Zuplo. This guide provides structured, actionable patterns for deploying a secure, rate-limited API gateway from a user's OpenAPI specification.

## Implementation Rules

### Do

- Always ask for the user's OpenAPI specification before starting (file path or URL)
- Ask for the backend API base URL that requests should be forwarded to
- Ask for rate limit settings (requests allowed, time window)
- Use `urlForwardHandler` for all route handlers to proxy requests to the backend
- Apply policies based on HTTP method (see Policy Selection Table)
- Configure `api-key-inbound` policy to require authentication on all routes
- Test locally with `zuplo dev` before deploying
- Verify successful local testing before proceeding to deployment
- Handle OAS import errors gracefully with actionable guidance

### Don't

- Assume the backend URL - always ask the user
- Modify the user's existing OpenAPI schemas
- Skip local testing - always verify before deployment
- Deploy without explicit user confirmation
- Apply `request-validation-inbound` to routes without request body schemas
- Continue with a broken OAS - guide user to fix it first

## Human-in-the-Loop Checkpoints

You must pause and collect information from the user at these checkpoints:

| Checkpoint | Information Required | When to Ask |
|------------|---------------------|-------------|
| 1 | OpenAPI specification (file path or URL) | Before creating the project |
| 2 | Backend API base URL | After confirming OAS is valid |
| 3 | Rate limit settings (requests/window) | After backend URL is confirmed |
| 4 | Local testing confirmation | After `zuplo dev` is running |
| 5 | Account linking confirmation | Before `zuplo link` |
| 6 | Deployment confirmation | Before `zuplo deploy` |

### Checkpoint Details

**Checkpoint 1 - OpenAPI Specification:**
```
I need your OpenAPI specification to create the API Gateway. Please provide either:
- A file path to your OpenAPI spec (JSON or YAML)
- A URL where the spec can be fetched

Example: ./my-api-spec.json or https://api.example.com/openapi.json
```

**Checkpoint 2 - Backend URL:**
```
What is the base URL of your backend API? This is where requests will be forwarded.

Example: https://api.mybackend.com or https://my-service.internal:8080
```

**Checkpoint 3 - Rate Limiting:**
```
Configure rate limiting for your API:
- How many requests per user? (default: 100)
- Time window in minutes? (default: 1)

Example: 1000 requests per 5 minutes
```

**Checkpoint 4 - Local Testing:**
```
The local development server is running at http://localhost:9000

Please test your endpoints to verify:
1. Routes are correctly mapped
2. Policies are applied as expected
3. Backend forwarding works

Confirm when testing is complete, or let me know if you encounter issues.
```

**Checkpoint 5 - Account Linking:**
```
Ready to link this project to your Zuplo account.
This will connect to portal.zuplo.com for deployment.

Confirm to proceed with account linking.
```

**Checkpoint 6 - Deployment:**
```
Ready to deploy your API Gateway to Zuplo's cloud.
This will make your gateway publicly accessible.

Confirm to proceed with deployment.
```

## Policy Configuration

### Required Policies

Configure these four policies in `config/policies.json`:

```json
{
  "policies": [
    {
      "name": "api-key-inbound",
      "policyType": "api-key-inbound",
      "handler": {
        "export": "ApiKeyInboundPolicy",
        "module": "$import(@zuplo/runtime)",
        "options": {
          "allowUnauthenticatedRequests": false,
          "cacheTtlSeconds": 60
        }
      }
    },
    {
      "name": "rate-limit-inbound",
      "policyType": "rate-limit-inbound",
      "handler": {
        "export": "RateLimitInboundPolicy",
        "module": "$import(@zuplo/runtime)",
        "options": {
          "rateLimitBy": "user",
          "requestsAllowed": 100,
          "timeWindowMinutes": 1
        }
      }
    },
    {
      "name": "request-validation-inbound",
      "policyType": "request-validation-inbound",
      "handler": {
        "export": "RequestValidationInboundPolicy",
        "module": "$import(@zuplo/runtime)",
        "options": {
          "includeRequestInLogs": false,
          "logLevel": "info",
          "validateBody": "reject-and-log",
          "validateHeaders": "none",
          "validatePathParameters": "log-only",
          "validateQueryParameters": "log-only"
        }
      }
    },
    {
      "name": "request-size-limit-inbound",
      "policyType": "request-size-limit-inbound",
      "handler": {
        "export": "RequestSizeLimitInboundPolicy",
        "module": "$import(@zuplo/runtime)",
        "options": {
          "maxSizeInBytes": 102400
        }
      }
    }
  ]
}
```

### Policy Selection by HTTP Method

| HTTP Method | Policies to Apply |
|-------------|-------------------|
| GET | `api-key-inbound`, `rate-limit-inbound` |
| DELETE | `api-key-inbound`, `rate-limit-inbound` |
| HEAD | `api-key-inbound`, `rate-limit-inbound` |
| OPTIONS | `api-key-inbound`, `rate-limit-inbound` |
| POST | `api-key-inbound`, `rate-limit-inbound`, `request-validation-inbound`*, `request-size-limit-inbound` |
| PUT | `api-key-inbound`, `rate-limit-inbound`, `request-validation-inbound`*, `request-size-limit-inbound` |
| PATCH | `api-key-inbound`, `rate-limit-inbound`, `request-validation-inbound`*, `request-size-limit-inbound` |

*Only apply `request-validation-inbound` if the operation has a `requestBody` with a schema defined in the OAS.

## Route Configuration Pattern

Each operation in the imported OAS needs an `x-zuplo-route` extension:

```json
{
  "paths": {
    "/resource": {
      "get": {
        "operationId": "get-resource",
        "x-zuplo-route": {
          "corsPolicy": "none",
          "handler": {
            "export": "urlForwardHandler",
            "module": "$import(@zuplo/runtime)",
            "options": {
              "baseUrl": "https://your-backend-api.com"
            }
          },
          "policies": {
            "inbound": ["api-key-inbound", "rate-limit-inbound"]
          }
        }
      },
      "post": {
        "operationId": "create-resource",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/Resource" }
            }
          }
        },
        "x-zuplo-route": {
          "corsPolicy": "none",
          "handler": {
            "export": "urlForwardHandler",
            "module": "$import(@zuplo/runtime)",
            "options": {
              "baseUrl": "https://your-backend-api.com"
            }
          },
          "policies": {
            "inbound": [
              "api-key-inbound",
              "rate-limit-inbound",
              "request-validation-inbound",
              "request-size-limit-inbound"
            ]
          }
        }
      }
    }
  }
}
```

## CLI Workflow

### Step 1: Create Project

```bash
npx create-zuplo-api@latest
```

Follow the prompts to create a new Zuplo project.

### Step 2: Import OpenAPI Specification

```bash
cd your-project-name
zuplo project import-openapi ./path/to/openapi.json
```

Or from a URL:

```bash
zuplo project import-openapi https://api.example.com/openapi.json
```

### Step 3: Configure Policies

Update `config/policies.json` with the four required policies (see Policy Configuration section).

Adjust the rate limit settings based on user input:

```json
{
  "options": {
    "rateLimitBy": "user",
    "requestsAllowed": <USER_SPECIFIED_REQUESTS>,
    "timeWindowMinutes": <USER_SPECIFIED_WINDOW>
  }
}
```

### Step 4: Configure Routes

For each operation in `config/routes.oas.json`, add the `x-zuplo-route` extension:

1. Set the `handler` to `urlForwardHandler` with the user's backend URL
2. Apply policies based on HTTP method (see Policy Selection Table)
3. Ensure each operation has a unique `operationId`

### Step 5: Local Testing

```bash
zuplo dev
```

Server starts at `http://localhost:9000`. Guide user to test their endpoints.

### Step 6: Link Account

```bash
zuplo link
```

Opens browser for Zuplo portal authentication.

### Step 7: Deploy

```bash
zuplo deploy
```

Deploys to Zuplo's cloud infrastructure.

## Handling Poor Quality OpenAPI Specifications

### Pre-Import Validation

Before importing, check for common issues:

1. **Missing `openapi` version field** - Must be 3.0.x or 3.1.x
2. **Missing `info` object** - Required by OpenAPI spec
3. **Missing `paths` object** - No routes to import
4. **Invalid JSON/YAML syntax** - Won't parse

### Import Failure Handling

If `zuplo project import-openapi` fails:

```
The OpenAPI specification could not be imported. This usually indicates issues
with the spec structure or content.

To diagnose and fix your OpenAPI spec:
1. Visit https://ratemyopenapi.com
2. Upload or paste your specification
3. Review the score and list of issues
4. Fix the reported problems
5. Re-attempt the import

Common issues that cause import failures:
- Invalid $ref references to non-existent schemas
- Missing required fields (operationId, responses)
- Circular references without proper handling
- Unsupported OpenAPI version (must be 3.0.x or 3.1.x)
```

### Partial Success Handling

If some routes import but others fail:

```
Import completed with warnings. Some routes could not be imported:

Failed routes:
- POST /resource: Missing requestBody schema
- GET /items/{id}: Invalid path parameter definition

Options:
1. Proceed with successfully imported routes only
2. Fix the OAS and re-import all routes

Would you like to proceed with the successful routes?
```

### Missing Request Body Schemas

If an operation has `requestBody` but no schema:

- **Skip `request-validation-inbound`** for that route
- Log a warning to the user
- Suggest adding schemas for full validation support

```
Note: The following routes have request bodies without schemas.
Request validation will be skipped for these routes:

- POST /users (no schema defined)
- PUT /users/{id} (no schema defined)

To enable request validation, add JSON schemas to your OpenAPI spec
for these operations' requestBody definitions.
```

## LLM Implementation Guidelines

### When Generating Configuration

1. **Always use exact policy names** - `api-key-inbound`, `rate-limit-inbound`, `request-validation-inbound`, `request-size-limit-inbound`
2. **Preserve user's OAS structure** - Only add `x-zuplo-route` extensions, don't modify existing content
3. **Generate unique operationIds** - If missing, create from method + path (e.g., `get-users`, `post-users-id`)
4. **Use consistent baseUrl** - Same backend URL for all routes unless user specifies otherwise

### Code Generation Checklist

- [ ] All routes have `x-zuplo-route` extension
- [ ] Handler is `urlForwardHandler` with correct backend URL
- [ ] Policies applied based on HTTP method
- [ ] `request-validation-inbound` only on routes with request body schemas
- [ ] Rate limit values match user specification
- [ ] Each operation has unique `operationId`

### Safe Defaults

| Setting | Default Value | User Can Override |
|---------|---------------|-------------------|
| Rate limit requests | 100 | Yes |
| Rate limit window | 1 minute | Yes |
| Request size limit | 100KB (102400 bytes) | Yes |
| CORS policy | none | No (keep simple) |
| API key caching | 60 seconds | No |

### Error Recovery Patterns

**OAS Parse Error:**
```
Guide user to https://ratemyopenapi.com for diagnosis
```

**Import Failure:**
```
1. Check for specific error message
2. Provide targeted fix suggestion
3. Offer to proceed with partial import if possible
```

**Local Test Failure:**
```
1. Verify backend URL is accessible
2. Check policy configuration
3. Review route mapping
```

**Deployment Failure:**
```
1. Verify account is linked
2. Check for configuration errors
3. Review deployment logs
```

## Complete Workflow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway Setup Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. [CHECKPOINT] Get OpenAPI spec from user                     │
│         ↓                                                        │
│  2. Validate OAS (if fails → ratemyopenapi.com)                 │
│         ↓                                                        │
│  3. [CHECKPOINT] Get backend URL from user                      │
│         ↓                                                        │
│  4. [CHECKPOINT] Get rate limit settings from user              │
│         ↓                                                        │
│  5. Create project: npx create-zuplo-api@latest                 │
│         ↓                                                        │
│  6. Import OAS: zuplo project import-openapi                    │
│         ↓                                                        │
│  7. Configure policies.json (4 policies)                        │
│         ↓                                                        │
│  8. Add x-zuplo-route to each operation                         │
│         ↓                                                        │
│  9. Start local server: zuplo dev                               │
│         ↓                                                        │
│ 10. [CHECKPOINT] User confirms local testing complete           │
│         ↓                                                        │
│ 11. [CHECKPOINT] Link account: zuplo link                       │
│         ↓                                                        │
│ 12. [CHECKPOINT] Deploy: zuplo deploy                           │
│         ↓                                                        │
│ 13. Return deployed gateway URL to user                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Success Criteria

The setup is complete when:

1. All routes from the OAS are configured with `x-zuplo-route`
2. API key authentication is required on all routes
3. Rate limiting is applied per user
4. Request validation is enabled for POST/PUT/PATCH routes (where schemas exist)
5. Local testing confirms routes work correctly
6. Gateway is deployed and accessible via Zuplo URL

**Remember:** Always pause at checkpoints to collect user input. Never assume configuration values that should come from the user. Guide users through OAS issues rather than failing silently.

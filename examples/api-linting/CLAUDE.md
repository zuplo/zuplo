# API Linting

See how to use API linting to enforce api consistency and require Zuplo features like policies.

## Key Files

| File | Purpose |
|------|--------|
| `config/api-ruleset.yaml` | Vacuum ruleset — the rules the linter enforces |
| `config/routes.oas.json` | Route definitions with policies — the file that gets linted |
| `config/policies.json` | Policy configurations |
| `lint-functions/zuploRequiredPolicy.js` | Custom lint function: require a specific policy |
| `lint-functions/pathStartsWithPolicy.js` | Custom lint function: validate path prefix |
| `schemas/*.json` | JSON Schemas imported by the validation policies |
| `modules/remove-user-id.ts` | Custom module |
| `modules/todos-and-users.ts` | Custom module |
| `modules/types.ts` | Custom module |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/todos` | Get all todos |
| POST | `/v1/todos` | Create Todo |
| GET | `/v1/todos-and-users` | Get todos with user information |
| PATCH | `/v1/todos/{todoId}` | Update Todo |
| DELETE | `/v1/todos/{todoId}` | Delete Todo |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example api-linting
```

**Lint the API:**
```bash
npm install
npm run lint
```

This example exists to demonstrate linting, not to be run as a gateway. The
only workflow it documents is `npm run lint`, which runs
[Vacuum](https://quobix.com/vacuum/) over `config/routes.oas.json` using the
ruleset in `config/api-ruleset.yaml` and the custom functions in
`lint-functions/`. It exits `0` when every rule passes and non-zero otherwise,
so it can be used directly as a CI gate.

## Working on this Example

When you change `config/routes.oas.json` or `config/api-ruleset.yaml`, re-run
`npm run lint` and confirm it still exits `0`.

- Every operation needs `x-zuplo-route` with `corsPolicy`, `handler` and
  `policies`.
- Every operation's `policies.inbound` must include `my-auth-policy`
  (`zuplo-require-policy`).
- Every path must start with `/v1` (`path-starts-with`).
- Every policy named on a route must be defined in `config/policies.json`.

## Policies Used

- **my-auth-policy** (Built-in): api-key-inbound — the policy `zuplo-require-policy` requires on every route
- **validate-json-schema-inbound** (Built-in): validate-json-schema-inbound
- **validate-json-schema-inbound-1** (Built-in): validate-json-schema-inbound
- **custom-code-outbound** (Custom): custom-code-outbound

## Environment Variables

None required for this example.

## Related Docs

- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)

# Zuplo Linting with Vacuum

How to lint a Zuplo API with [Vacuum](https://quobix.com/vacuum/)

This project uses both built-in and custom rules to lint the routes OpenAPI files in this project.

The following custom rules are used:

- Enforce that routes have a specific Zuplo Policy
- Enforce that the path of routes starts with a specific value.

The configuration rules can be found in `config/api-ruleset.yaml`. Custom functions are in `/lint-functions`.

## Run

To run this sample yourself:

```
npm install
npm run lint
```

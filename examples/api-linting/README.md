# Zuplo Linting with Vacuum

How to lint a Zuplo API with [Vacuum](https://quobix.com/vacuum/)

This project uses both built-in and custom rules to lint the routes OpenAPI files in this project.

The following custom rules are used:

- Enforce that routes have a specific Zuplo Policy
- Enforce that the path of routes starts with a specific value.

The configuration rules can be found in `config/api-ruleset.yaml`. Custom functions are in `/lint-functions`.

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example api-linting
```
Then, in the project directory run the following commands:

```
npm install
npm run lint
```

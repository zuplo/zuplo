# Schema Validation from File Refs

This sample demonstrates how to use the [Request Validation](https://zuplo.com/docs/policies/request-validation-inbound) policy and write an OpenAPI spec that references external files using a `$ref`.

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example schema-validation-file-ref
```
Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```
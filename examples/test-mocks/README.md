# Zuplo Mocking & Unit Test Sample

This sample shows how to mock `ZuploRequest` and `ZuploContext` in order to write unit tests. This sample uses [mocha](https://mochajs.org/) and [sinon](https://sinonjs.org/), but the concepts apply to any test and mocking tool.

See the [`handlers.spec.ts`](https://github.com/zuplo/zuplo/blob/main/examples/test-mocks/unit-tests/handlers.spec.ts) file for details.

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example test-mocks
```
Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

You can start the tests by running:

```bash
npm run unit
```
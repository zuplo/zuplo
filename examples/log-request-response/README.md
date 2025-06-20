# Log Request & Response

This sample shows how to add logging for every request that captures the full request and response in order to send to your log provider.

This example uses the [OnResponseSendingFinal](https://zuplo.com/docs/articles/runtime-extensions#hooks-onresponsesendingfinal) hook in the `zuplo.runtime.ts` file to register a global log event.

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example log-request-response
```
Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

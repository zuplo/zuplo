# Custom Rate Limit Body

This sample demostrates how to invoke the Rate Limit policy programatically and then modify the 429 response body with additional context information.

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example custom-429-response
```
Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```
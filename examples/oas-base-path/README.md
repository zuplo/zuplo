# Custom Base Path

This examples shows how to store base path and backend server configuration in the `servers` object of the OpenAPI and then use a policy to dynamically remove the base path and set the forwarded property of the URL in order to send the request to the correct backend server.

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example oas-base-path
```
Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

## Example OpenAPI Configuration

Adding the custom extension `x-base-path` to the servers object allows us to match the base path to the correct server url.

```json
  "servers": [
    {
      "url": "https://echo.zuplo.io",
      "x-base-path": "/my-base-1"
    }
  ],
```

## Import the OpenAPI files

Zuplo allows importing the OpenAPI JSON files into a module so their configuration can be read.

```ts
import { servers as servers1 } from "../config/routes1.oas.json";
import { servers as servers2 } from "../config/routes2.oas.json";

const servers = [...servers1, ...servers2];
```

A point of caution here. Zuplo's build will import anything that is referenced. So if you import the entire OpenAPI file (i.e. `import routes from "../config/routes.oas.json"`), the entire contents will be in your build and could impact your Gateway's performance if you have a particularly large file.

This is why, in the above example, only the `{ servers }` portion of the file is imported.

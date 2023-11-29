# Route Custom Data

This sample demonstrates how to read custom data from a route configuration.

## 1/ Set Custom Data

In the `routes.oas.json` set a custom value inside of the route configuration as shown below. In this case, the `x-custom` property is used, but any property that starts with `x-` can be used.

```json
{
  "paths": {
    "/custom-data": {
      "post": {
        "x-custom": {
          "isSet": true,
          "hello": "world"
        }
      }
    }
  }
}
```

## 2/ Read Custom Data

From a handler or policy custom data can be read using `ZuploContext` as shown below.

```ts
const data = context.route.raw<{ "x-custom": { hello: boolean } }>();
```

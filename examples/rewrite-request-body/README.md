# Rewrite Request Body

This sample demonstrates how to rewrite the body of an incoming JSON request.

## 1/ Create Route

Create a route that uses the [URL Rewrite Handler](https://zuplo.com/docs/handlers/url-rewrite). The rewrite points to the Zuplo Echo API at https://echo.zuplo.io.

## 2/ Add Policy

Create a [custom policy](https://zuplo.com/docs/policies/custom-code-inbound). This policy just takes body of the incoming request and adds two properties to the object.

Create an empty incoming policy called `rewrite-body.ts` and add the following code to the function.

```ts
// Read the incoming body
const body = await request.json();

// Create a new body with additional properties
const outbound = {
  ...body,
  id: crypto.randomUUID(),
  createdOn: new Date(),
};

// Return a new request with the modified body
return new Request(request, {
  body: JSON.stringify(outbound),
});
```

## 3/ Call the API

The API can now be called and will return the echoed response. Note, the echo API returns a serialized version of the entire request so you will get back the body, url, headers, etc. In this example, you will see that the body has the original `hello` property and two new properties `id` and `createdOn`

```bash
curl -X POST https://API_URL/rewrite-bod
   -H "Content-Type: application/json"
   -H "Authorization: user123"
   -d '{"hello": "world" }'
```

Response:

```json
{
  "url": "https://echo.zuplo.io/rewrite-body",
  "method": "POST",
  "query": {},
  "body": {
    "hello": "world",
    "id": "d06b3a27-b40e-48f2-934a-1585ab993e8a",
    "createdOn": "2023-06-05T15:46:14.202Z"
  },
  ...
}
```

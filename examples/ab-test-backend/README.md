# Route Custom Data

This sample demonstrates how to send some amount of traffic to a different API backend and have the version of the backend be sticky for a particular user.

This type of A/B testing can be useful for rolling out a new version of your backend or testing performance of different backend configurations.

> NOTE: In order to use this example, you must have Zuplo's KV storage enabled on your account. This is a paid feature available only to enterprise customers.

## How it Works

After a request is authenticated (in the case of the example using the "fake auth" policy), the user is randomly assigned to either the `test` or `control` group.

```ts
let val = rand < FLIGHT_PERCENT ? "test" : "control";
```

The result of the assignment is stored in Zuplo's distributed Key Value storage. This way, the result of the assignment can be used on later requests. This prevents the user from randomly moving between the different test groups.

```ts
await kv.put(key, val);
```

On subsequent requests, the assignment is pulled from Key Value storage.

```ts
let val = await kv.get(key);
```

Finally, a `context.custom` property is set, in this case `apiUrl` based on the user's assignment. That URL value can then be used in later policies and handlers to route requests to the correct backend.

## Calling the API

In order to call the API and see the A/B test in action, make a request and set the header `fake-user`. This fake authentication policy allows you to simulate the current user.

```sh
curl -i -H "fake-user: 123" https://ab-test-backend-main-e1f9895.zuplo.app/test
```

# OpenFGA Authorization

This sample demonstrates how to use OpenFGA from a custom Zuplo policy to authorize access to a resource.

The custom policy is configured to read configuration from the `x-authorization` extension in the OpenAPI definition. The configuration of that property is a JSON object with the following properties:

- `relation`: The relation of the user to the resource. This is the value of the `relation` property in the OpenFGA policy.
- `objectType`: The type of the resource. This is used to build the `object` property in the OpenFGA policy. For example, if this property is set as `document`, then the `object` property in the OpenFGA policy will be `document:{id}` where the value of `{id}` comes from the URL .
- `objectParam`: The name of the parameter in the request that contains the resource identifier. For example, if your url is `/docs/{id}`, then the value of this property should be `id`.

```json
"x-authorization": {
  "relation": "reader",
  "objectType": "document",
  "objectParam": "id"
},
```

The policy will then use the `relation`, `object` and `objectType` properties to build the OpenFGA policy and authorize the request. For example, if user `auth0|123` calls the url `/docs/456` the policy will check the following tuple results in a valid access check:

```json
{
  "user": "user:auth0|123",
  "relation": "reader",
  "object": "document:456"
}
```

If the user is authorized as a reader on that document, the request will be allowed. Otherwise, it will be denied.

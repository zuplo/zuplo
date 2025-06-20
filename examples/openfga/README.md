# OpenFGA Authorization

This sample demonstrates how to use OpenFGA from a custom Zuplo policy to authorize access to a resource.

## Prerequisites

In order to use this sample, you will need to configuration an authorization policy. This sample is setup with the [Zuplo Auth0 authentication policy](https://zuplo.com/docs/policies/auth0-jwt-auth-inbound), but you can use any authentication or custom authentication policy. You will need to configure the policy with your own identity provider.

You will also need an OpenFGA service. You can run OpenFGA locally as shown in [the documentation](https://openfga.dev/docs/getting-started/setup-openfga/docker#step-by-step). When running locally, in order to use this sample, you'll want to use [Zuplo Local Development](https://zuplo.com/docs/articles/local-development).

## OpenFGA Policy

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

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example open-fga
```
Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

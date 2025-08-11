# Dev Portal with API Key Creation

This example demonstrates how to add self-serve API key creation to the Zuplo Dev Portal so users have end to end ability to create, roll and delete API keys from within the API Keys settings tab.

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/sign-up).

## Setup

We recommend that you work with this example locally on your own machine.

### Local Development

You can setup your own version of the project using the Zuplo CLI.

```
npx create-zuplo-api@latest --example dev-portal-with-api-keys
```
Because some of the setup requires you to use the Zuplo portal in your browser, you will need to deploy the project to Zuplo using the CLI.

```
zuplo deploy
```

### One-Click Deploy
You can also deploy this example to your Zuplo account directly using the Deploy To Zuplo button on this page.

Please note that with this approach, you will need to set up your environment variables in the settings of your Zuplo project, rather than in the `.env` file. You can find out how by following our [Configuring Environment Variables](https://zuplo.com/docs/articles/environment-variables) documentation.

## Setup the API Key Service
Every Zuplo project that uses our API key management must have the API Key Service enabled. To do this on the project you just deployed, follow these steps:

1. Login to your Zuplo account
2. Navigate to the name of the project you created using the CLI
3. Click on _Services_
4. On this page, select the _Preview_ environment from the dropdown
5. Note the _Bucket Name_ for the Preview environment, you will need it for the next step

## Configuration
Next, get your environment variables set up by copying the `env.example` to a new `.env` file.

```
cp env.example .env
```

Now add the required environment variables:

- `ZP_DEVELOPER_API_KEY`: You will need to create an account level API for working with Zuplo's API. You can do this by following the [Zuplo API Keys](https://zuplo.com/docs/articles/accounts/zuplo-api-keys) guide
- `ZP_ACCOUNT_NAME`: This is the name on your account, for example `plum_giant_llama`
- `ZP_API_KEY_SERVICE_BUCKET_NAME`: Use the bucket name for the API Key Service in the Preview environment you got from the previous step

## Running the example
With the configuration complete, it's time to run the example and test it out.

Start the Zuplo API Gateway by running:

```
npm run dev
```

Then, in a new terminal window, start the Developer Portal server:

```
npm run docs
```

The API Gateway will start on `https://localhost:9000` and the Developer Portal will be at `https://localhost:3000`.

Open the Developer Portal in your browser by heading to `https://localhost:3000` and you should see this guide as the main documentation.

## Making a request

Open the API Reference in the Developer Portal, and make a request to any endpoint using the API Playground that opens when you click the _Test_ button.

Of course, the request fails with `401 Unauthorized` because all the endpoints expect that an API key is provided. You can see each routes configuration by opening the route designer at `https://localhost:9100`.

## Create an API Key
Let's create an API key, just as your users would do.

1. Click on the _Login_ button on the top right of the Developer Portal
2. Sign up using single sign on (it's faster)
3. After sign up, click on your name to reveal the drop down menu
4. Click on _API Keys_
5. Click _Create API Key_
6. Enter a name for your API Key, and select an Expiration time
7. Click _Generate Key_

The API key will be created and added to the API Keys page. You can now retry the request again but this time your new API key will be available to select in the API Playground.

Select it and make the request as a fully authenticated API user. The request should return a list of Todos, and be `200 OK`.

## API creation code
The way the API keys are created in this example is a demonstration of _one approach_ that you could take using Zuplo's API. Using the API makes creating API keys very flexible, so where and how you do this is up to you.

### Server side
The server side aspect of this is contained in two files in the example:

- `modules/api-keys.ts`
- `config/api-key.oas.json`

`api-key.oas.json` is an OpenAPI document that defines a new endpoint `/v1/developer/api-key` that is called from the client side code of the Developer Portal.

`api-keys.ts` is a custom function that runs a a result of calling that API endpoint. This function calls the Zuplo API Keys API endpoint to create the API key for the user that is logged in.

### Client side
The connection between the Developer Portal and the API for creating API keys is configured in the `docs/zudoku.config.tsx` file.

[Zuplo's Developer Portals](https://zuplo.com/docs/dev-portal/zudoku/guides/managing-api-keys-and-identities) are powered by [Zudoku](https://zudoku.dev) which provides hooks into the underlying `ApiKeyService` allowing you to customize the functionality.

In this example, on line 82 of `docs/zudoku.config.tsx` it is the `createKey` hook that is customized.

```typescript
createKey: async ({ apiKey, context, auth }) => {
  const serverUrl = process.env.ZUPLO_PUBLIC_SERVER_URL || import.meta.env.ZUPLO_SERVER_URL;
  const createApiKeyRequest = new Request(serverUrl + "/v1/developer/api-key", {
    method: "POST",
    body: JSON.stringify({
      ...apiKey,
      email: auth.profile?.email,
      metadata: {
        userId: auth.profile?.sub,
        name: auth.profile?.name,
      },
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });

  const createApiKey = await fetch(
    await context.signRequest(createApiKeyRequest),
  );

  if (!createApiKey.ok) {
    throw new Error("Could not create API Key");
  } 

  return true;
},
```

_Note: When working locally, `process.env.ZUPLO_PUBLIC_SERVER_URL` should be set in your `.env` file. However, the deployed environment will use `import.meta.env.ZUPLO_SERVER_URL` instead. This is set automatically on the environment for you. You do not need to create an environment variable for `ZUPLO_SERVER_URL` in the Zuplo Portal._

This function executes when the _Generate Key_ button in the API Key creation UI is clicked.

It makes a signed request to the proxy API on the gateway exposed by `api-key.oas.json` with the necessary body content such as `email`, `userId` and `name` if they are available.

All requests must be signed as the authenticated user for security reasons. Request signing is implemented using the [`OpenIdJwtInboundPolicy`](https://zuplo.com/docs/policies/open-id-jwt-auth-inbound) specified in `policies.json`.
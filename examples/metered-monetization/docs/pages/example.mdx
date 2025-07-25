# Metered Monetization with OpenMeter

In order to enable a flexible approach to monetizing an API, we recommend using [OpenMeter](https://openmeter.io/) to handle metering, customer tracking, subscription plans and invoicing.

To enable you to create a seamless experience with Zuplo and OpenMeter we have an OpenMeter Metering Policy that allows you to store any metered events as well as ensure that customers who are at or over the limit of their allowed plans, cannot continue to make requests.

This example demonstrates using our OpenMeter policy to track API requests into OpenMeter. Additionally, it includes an integration between the built-in Zuplo Dev Portal and OpenMeter that allows users to self-serve sign up, be assigned a limited free plan for their API requests, and create API keys.

## Prerequisites

### OpenMeter Account
To work with this example you will need an OpenMeter account. You can sign up for their [free cloud based account](https://openmeter.io/pricing), or use the [self-hosted version](https://github.com/openmeterio/openmeter) on infrastructure of your choice (including Docker and Kubernetes).

### Zuplo Account
We recommend that you work with this example locally to give you the most flexibility. To get a local copy run:

```bash
npx create-zuplo-api@latest --example https://github.com/zuplo/zuplo/tree/main/examples/metered-monetization
```

## Setting up OpenMeter

This project includes an automated setup script that will configure the necessary OpenMeter resources for you. Follow these steps:

### 1. Configure Environment Variables

Before running the setup script, you'll need to configure your OpenMeter API key. Copy the `env.example` file to create your `.env` file:

```bash
cp env.example .env
```

Then edit the `.env` file and set your OpenMeter API key:

```bash
OPENMETER_API_KEY=your_actual_openmeter_api_key_here
OPENMETER_URL=https://openmeter.cloud  # or your self-hosted URL
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Setup Script

```bash
npm run setup
```

This script will:
- Create a meter with slug `api_requests_total`
- Create a new feature for `api_requests` that users are given access to
- Create a new free plan for users to be subscribed to by default with a limit of 10 requests

The script is idempotent, so you can run it multiple times safely. If the meter already exists, it will skip creation and notify you.

If you would prefer to set this up manually in OpenMeter, you can do so and skip running this script.

## Setup Environment Variables

Once your OpenMeter instance is set up to work with this example, you can configure the rest of the environment variables.

- **`OPENMETER_FEATURE_KEY`**: The feature key that defines what you're metering (e.g., "api-requests")
- **`OPENMETER_SOURCE`**: Source identifier for your metering events (e.g., "zuplo-api")
- **`OPENMETER_URL`**: OpenMeter API URL (defaults to `https://openmeter.cloud` for cloud accounts)
- **`API_KEY_SERVICE_BUCKET_NAME`**: Zuplo bucket name for storing API key data
- **`ZUPLO_PUBLIC_DEPLOYMENT_NAME`**: Your Zuplo deployment name (used by the docs portal)
- **`ZUPLO_PUBLIC_SERVER_URL`**: Your Zuplo server URL (used by the docs portal)

## Gateway Configuration

### The API
This example uses our Todo List API as a base. It's a simple CRUD API that allows users to create, update, and delete Todos and is centered around a mock API.

### OpenMeter Metering Policy

This example includes a pre-configured OpenMeter metering policy in `config/policies.json`. The policy is already set up to:

1. **Track API requests**: Automatically meter each request that passes through your gateway
2. **Extract customer information**: Use the API key metadata to identify customers
3. **Send metering data**: Forward usage data to OpenMeter for tracking and billing

The policy runs on the POST and GET routes, but not on DELETE (but you're welcome to add it).

It will check if a user has access and/or balance left on their plan by calling the OpenMeter API, and if they do it will allow the request and meter the event in OpenMeter.

The configuration for OpenMeter in `policies.json` looks like this:

```json
{
  "name": "openmeter-metering-inbound",
  "policyType": "openmeter-metering-inbound",
  "handler": {
    "export": "OpenMeterMeteringInboundPolicy",
    "module": "$import(@zuplo/runtime)",
    "options": {
      "apiKey": "$env(OPENMETER_API_KEY)",
      "customerIdPropertyPath": ".data.openmeter.subjectId",
      "eventType": "request",
      "meterValue": 1,
      "source": "$env(OPENMETER_SOURCE)",
      "url": "$env(OPENMETER_URL)/api/v1/events"
    }
  }
}
```

### Identifying Users for Metering

In this example, when a user creates an API key the `openmeter.subjectId` is added to the metadata for each API key.

This allows the OpenMeter Metering policy to correctly identify the user and meter against their OpenMeter Subject ID regardless of whether the API key is used in the Dev Portal, an HTTP testing tool such as HTTPie, or in another application.

This implementation is just an example as there are multiple places that the identifier for a subject could be stored and retrieved.

## The Setup So Far

At this point you have:

- Setup OpenMeter
- Added the necessary OpenMeter elements by running `npm run setup`
- Setup your environment variables

Now it's time to test everything locally.

## Running Locally
Start the servers for the API gateway and developer portal by running:

```bash
npm run dev
npm run docs
```

To test that everything is set up correctly, load the developer portal by opening [http://localhost:3000](http://localhost:3000) in your browser. It will load the API reference for the Todo API.

Next, use the API playground to test the _Get all todos_ route. It should return `401 Unauthorized`.

### Creating a user
Conceptually, creating a user via the Developer Portal would be the same as a user signing up for your service. In this example, users are created on the Zuplo Auth0 test account that all developer portals are provided with by default.

1. Create a user by clicking **Login**
2. On the sign in page, click on **Sign up**
3. Register an account (Google Single Sign-On is fastest for testing)
4. Once registered you will be logged in and returned to the API Reference

### Create an API Key
The Zuplo Developer Portal supports the creation and management of API keys directly from within the portal itself (this is also an example of how that can be achieved).

To create a new API key to use with the Todo API:

1. Click on your name, and then on *API Keys*.
2. Click on Create API Key
3. Give your API a name (this will display in the portal)
4. (Optional) Set a key expiry date
5. Click Generate Key

Your key will be generated, but there's also some OpenMeter magic that happened in the background. Let's explore that more so you can understand how this all fits together.

## How API Key Creation & OpenMeter Fit Together

When an API key is created for the first time by a new user, several other API calls are made to the OpenMeter API to:

- Add the user to OpenMeter as a new `Subject`
- Give the user an OpenMeter `Entitlement` to access the API in a metered way
- Subscribe the user to the Free plan so limitations can be enforced (the free plan in this example allows 10 requests)

Additionally, the OpenMeter Subject ID for the user is added to the API key metadata that is referenced by the OpenMeter Metering Policy to keep everything linked together.

You can see the full source code for this in `modules/apiKeys.ts`.

_Note: OpenMeter is incredibly flexible, as is the Zuplo Developer Portal, so there are many ways that a similar flow could be created for your users at various times in their lifecycle, and from other places such as your own website. This example serves as a guide to the steps that need to be taken, and you can adapt them however you like._

## Test As a Registered User
At this point you are considered a registered user of the Todo API, and you've been given access to all 10 API requests that the Free plan offers (use them wisely!).

Head back to the *API Reference*, and click the *Test* button to load the API Playground once again.

You will now see that your API key has become available to select. You can use this to make authenticated requests against the API that will be metered against the available quota on your free plan.

Once you use all your available quota, you will no longer be able to make requests.

## Adding Billing & Payment
You are welcome to use this example as the basis for your Zuplo project but the next steps would be to add billing and payment options.

All of this can be done directly with OpenMeter, and you can reflect as much or as little of that back into your Developer Portal as you'd like. Recommended next steps for this would be:

1. Add some paid plans to your OpenMeter instance
2. Connect your OpenMeter instance to Stripe (or PayPal, or Adyen) to handle billing and payments
3. Create a custom pricing page in the developer portal that allows logged in users to switch between plans and provide the necessary credit card information

Please see the OpenMeter documentation for more details on how to do this.


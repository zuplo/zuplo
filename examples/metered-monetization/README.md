# Metered Monetization with OpenMeter

In order to enable a flexible approach to monetizing an API, we recommend using
[OpenMeter](https://openmeter.io/) to handle metering, customer tracking,
subscription plans and invoicing.

Our [OpenMeter Metering Policy](../policies/openmeter-metering-inbound) allows you to track metered events as well as ensure that customers who are at, or over, the limit of their allowed plans, cannot continue to make requests.

This example demonstrates using our OpenMeter policy to:

* Track API requests in OpenMeter
* Check user access/plan limit to ensure requests are allowed
* Allow users to self-serve sign up and create API keys
* Assign a limited free plan to each new user

## Prerequisites

* **OpenMeter Account**: Sign up for OpenMeter's [free cloud based account](https://openmeter.io/pricing), or use the [self-hosted version](https://github.com/openmeterio/openmeter) on infrastructure of your choice (including Docker and Kubernetes).

* **Zuplo Account**: If you don't already have a Zuplo account you can [sign up for free](https://portal.zuplo.com/signup).

## Get the example code

We recommend that you work with this example locally to give you the most flexibility and visibility into how all the pieces fit together. You can use the Zuplo CLI to set up a local copy using this example as a template:

```bash
npx create-zuplo-api@latest --example metered-monetization
```

The above command will create a copy of the project on your local machine and install all the dependencies.

## Running the example

### 1. Create a matching Zuplo project
The example requires some configuration from your Zuplo account as well, so [create a new empty project in the Zuplo portal](https://portal.zuplo.com) (e.g. `metered-monetization`).

### 2. Create a new branch
In your local example directory, create a new `preview` branch to work with:

```bash
git checkout -b preview
```

### 3. Connect your local and remote projects
Deploy your local preview branch to Zuplo:

```bash
zuplo deploy # CLI will ask you which project to deploy to. Choose the project you created in step 1.
```

Now link the local and remote project settings:

```bash
zuplo link
```

This will create an `.env.zuplo` file in your working directory that contains some additional environment variables needed to run this example. You do not need to edit this file.

### 4. Setup Gateway environment variables
Next, copy the `env.example` file and start setting up the additional required variables:

```bash
cp env.example .env
```

Here you need to add values for three variables:

- `OPENMETER_API_KEY`: You can find this in the _[Integrations > API](https://openmeter.cloud/rest-api)_ section of your OpenMeter dashboard
- `ZP_DEVELOPER_API_KEY`: An
  [API key for working with your Zuplo account](https://zuplo.com/docs/articles/api-key-administration)
- `ZP_API_KEY_SERVICE_BUCKET_NAME`: For storing API key data. You can get the Bucket Name from the _Services_ section of your Zuplo project. Select the _Preview_ environment. The bucket name will look something like this: `zprj-t36863ssgvefw0gjgfamb9z4-preview`

### 5. Setup the Dev Portal environment variables
Next, copy and configure the environment variables required to use the Developer Portal locally:

```bash
cp docs/env.local.example docs/.env.local
```

Here you need to add the `ZUPLO_PUBLIC_DEPLOYMENT_NAME` value. You can find the deployment name in your Zuplo Portal by clicking on _Environments_ and copying the _Gateway_ address for the _Preview_ environment.

It will look like this: `https://metered-monetization-preview-efef9b3.zuplo.app`

Add only the name of the deployment to `.env.local`, e.g. `ZUPLO_PUBLIC_DEPLOYMENT_NAME=metered-monetization-preview-efef9b3`

### 6. Configure OpenMeter

The fastest way to run this project is to use the setup script to configure your OpenMeter instance with the expected features. We added a script that uses your `OPENMETER_API_KEY` to do this quickly:

```bash
npm run setup
```

The script uses the OpenMeter API to:

- Create a meter with slug `api_requests_total`
- Create a new feature for `api_requests` that users are given access to
- Create a new free plan for users to be subscribed to by default with a limit
  of 10 requests

The script is idempotent, so you can run it multiple times safely. If the meter
already exists, it will skip creation and notify you.

If you would prefer to set this up manually in OpenMeter, you can do so and skip
running this script.

Please refer to the OpenMeter documentation for
[Creating Meters](https://openmeter.io/docs/metering/guides/creating-meters),
[Subjects](https://openmeter.io/docs/metering/subjects),
[Entitlements](https://openmeter.io/docs/billing/entitlements/entitlement),
[Plans](https://openmeter.io/docs/billing/product-catalog/plan), and
[Subscriptions](https://openmeter.io/docs/billing/subscription/overview).

### 7. Run the project

With everything configured, you can now run the example and test it out. First start the API Gateway:

```bash
npm run dev
```

Then start the developer portal:

```bash
npm run docs
```

Now the project is up and running in a default state you can open the Developer Portal at `http://localhost:3000`.

Next, read the overview for the next steps and explanations of creating users, and API Keys that will be limited by OpenMeter.

## Example Project Overview

The example project is made up of an API gateway, and a Developer Portal.

- The API tracks requests into an OpenMeter instance using the OpenMeter Metering Policy
- The Developer Portal allows user creation, API key generation and management and connects to OpenMeter to allow those users access to the API, and assigns them a specific price plan.

### API Overview

This example uses our Todo List API as a base. It's a simple CRUD API that
allows users to create, update, and delete Todos and is centered around a mock
API.

### OpenMeter Overview

The OpenMeter metering policy is pre-configured in
`config/policies.json`. This configuration allows the API gateway to:

* **Track API requests**: Automatically meter each request that passes through
   your gateway
* **Extract customer information**: Use the API key metadata to identify
   customers
* **Send metering data**: Forward usage data to OpenMeter for tracking and
   billing

The policy runs on the `POST` and `GET` routes, but not on `DELETE` (but you're
welcome to add it).

The policy will check if a user has access and/or balance left on their plan by calling
the OpenMeter API, and if they do it will allow the request and meter the event
in OpenMeter.

You can see the configuration for the OpenMeter Policy in `config/policies.json`.:

```json
{
  "name": "openmeter-metering-inbound",
  "policyType": "openmeter-inbound",
  "handler": {
    "export": "OpenMeterInboundPolicy",
    "module": "$import(@zuplo/runtime)",
    "options": {
      "apiKey": "$env(OPENMETER_API_KEY)",
      "subjectPath": ".data.openmeter.subjectId",
      "eventSource": "$env(OPENMETER_SOURCE)",
      "apiUrl": "$env(OPENMETER_URL)",
      "meter": {
        "type": "request",
        "value": 1
      },
      "requiredEntitlements": ["api_requests"]
    }
  }
}
```

For more information on this configuration, see the [OpenMeter Metering Policy documentation](https://zuplo.com/docs/policies/openmeter-inbound#basic-metering).

### How Users Are Identified for Metering

When a user creates an API key their corresponding `SubjectId` from OpenMeter is added to the metadata for each API key as `openmeter.subjectId`.

This allows the OpenMeter policy to correctly identify the user and
meter against their OpenMeter Subject ID regardless of whether the API key is
used in the Dev Portal, an HTTP testing tool such as HTTPie, or in another
application.

If the user creates multiple API keys, they will all have the same `subjectId` assigned to them.

_This implementation is just an example to help you understand the concepts of working with Zuplo and OpenMeter. There are multiple places that the `subjectId` could be stored and retrieved depending on your IDP and use cases._

## Testing as an unregistered user

You can now test out the experience for unregistered users.

Use the API playground to test the _Get all todos_ route. It should return `401 Unauthorized`.

This is because there are no users registered right now, and no API key is provided for the _Get all todos_ route.

## Creating a user

Conceptually, creating a user via the Developer Portal would be the same as a
user signing up for your service. In this example, users are created on the
Zuplo Auth0 test account that all developer portals are provided with by
default.

1. Create a user by clicking **Login**
2. On the sign in page, click on **Sign up**
3. Register an account (Google Single Sign-On is fastest for testing)
4. Once registered you will be logged in and returned to the API Reference

### Create an API Key for a user

The Zuplo Developer Portal supports the creation and management of API keys
directly from within the portal itself.

1. Click on your name, and then on _API Keys_
2. Click on _Create API Key_
3. Give your API a name (this will display in the portal)
4. (Optional) Set a key expiry date
5. Click Generate Key

Your key will be generated, but there's also some OpenMeter magic that happened
in the background.

Let's explore that more so you can understand how this all
fits together.

## How API Key Creation & OpenMeter Fit Together

When an API key is created for the first time by a new user, several additional API
calls are made to the OpenMeter API:

- Add the user to OpenMeter as a new `Subject`
- Give the user an OpenMeter `Entitlement` to access the API in a metered way
- Subscribe the user to the Free plan so limitations can be enforced (the free
  plan in this example allows 10 requests)

Additionally, the OpenMeter Subject ID for the user is added to the API key
metadata that is referenced by the OpenMeter Metering Policy in the API gateway to keep everything
linked together.

You can see the full source code for this in `modules/apiKeys.ts`.


_OpenMeter is incredibly flexible, as is the Zuplo Developer Portal, so
there are many ways that a similar flow could be created for your users at
various times in their lifecycle, as well as from other places such as your own
website. This example serves as a guide to the steps that need to be taken, and
you can adapt them for your own use case._

## Test As a Registered User

At this point you are considered a registered user of the Todo API, and you've
been given access to all 10 API requests that the Free plan offers (use them
wisely!).

1. Head back to the _API Reference_, and click the _Test_ button to load the API
Playground once again.

2. You will see that your API key has become available to select. You can use
this to make authenticated requests against the API that will be metered against
the available quota on your free plan.

3. Select your API key and make the request again, you should see a list of todos returned and get a `200 OK` response.

Once you use all your available quota (10 requests), you will no longer be able to make
requests and the API will begin returning `429 Too Many Requests` responses.

## Adding Billing & Payment

All of this can be done directly with OpenMeter, and you can reflect as much or
as little of that back into your Developer Portal as you'd like. Recommended
next steps for this would be:

1. Add some paid plans to your OpenMeter instance
2. Connect your OpenMeter instance to Stripe (or PayPal, or Adyen) to handle
   billing and payments
3. Create a custom pricing page in the developer portal that allows logged in
   users to switch between plans and provide the necessary credit card
   information

Please see the
[OpenMeter documentation](https://openmeter.io/docs/billing/overview) for more
details on how to do this.

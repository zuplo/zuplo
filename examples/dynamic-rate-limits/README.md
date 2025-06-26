# Creating dynamic rate limits 

This example shows how to create dynamic rate limits with the Rick And Morty API sample: https://github.com/zuplo-samples/rick-and-morty

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example dynamic-rate-limits
```
Then, in the project directory run the following commands:

```bash
npm install
npm run dev
```

## Walkthrough

We will make the rate-limiting policy more dynamic, based on properties of the customer. Update the metadata of your two API Key consumers to have a property `customerType`. Set one to `free` and another to `premium`.

![Customer Metadata](https://cdn.zuplo.com/assets/259b5845-cbe4-47f8-986a-a9a469c30be6.png)

Now add a new module to the files section by clicking on the `+` next to the **Modules** folder and choose new empty module.

![New module](https://cdn.zuplo.com/assets/1f6b403a-67b9-43ac-8fb4-e2b813376911.png)

Add the following code to your module.

```ts
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export function rateLimit(request: ZuploRequest, context: ZuploContext) {
  const user = request.user;

  // premium customers get 1000 requests per mintue
  if (user.data.customerType === "premium") {
    return {
      key: user.sub,
      requestsAllowed: 1000,
      timeWindowMinutes: 1,
    };
  }

  // free customers get 5 requests per minute
  if (user.data.customerType === "free") {
    return {
      key: user.sub,
      requestsAllowed: 5,
      timeWindowMinutes: 1,
    };
  }

  // everybody else gets 30 requests per minute
  return {
    key: user.sub,
    requestsAllowed: 30,
    timeWindowMinutes: 1,
  };
}
```

Now we'll reconfigure the rate-limit policy to wire up our custom function. Add the `api-key-inbound` policy and the `rate-limit-inbound` policy in the **Route Designer**. Make sure the `api-key-inbound` policy is above the `rate-limit-inbound` policy as the order matters (you need to authenticate the user before you can rate limit them).

Once you have added both policies, click on the `rate-limit-inbound` policy to edit it.

![Edit Policy](https://cdn.zuplo.com/assets/acfc1097-4ff2-4e7d-bee1-0cab4128a695.png)

Update the configuration

```json
{
  "export": "RateLimitInboundPolicy",
  "module": "$import(@zuplo/runtime)",
  "options": {
    "rateLimitBy": "function",
    "requestsAllowed": 2,
    "timeWindowMinutes": 1,
    "identifier": {
      "export": "rateLimit",
      "module": "$import(./modules/rate-limit)"
    }
  }
}
```

This identifies our `rate-limit` module and the function `rateLimit` that it exports.

### Create a new API Key

Create a new API Key for a free user and try to make more than 5 requests per minute.

Go to **_Project Settings > API Key Consumer > Add New Consumer_**

Add the following metadata:

```json
{
  "customerType": "free"
}
```

![Add new consumer](https://cdn.zuplo.com/assets/39cc03a6-bd1e-42cc-b471-188ed9100540.png)

Copy the API Key and try to test the API by going to the test console: 

![Open the test console](https://cdn.zuplo.com/assets/1a7c8ea8-c05a-4cb6-a7bf-9177ae0b3f6e.png)

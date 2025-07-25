/**
 * API Key Creation Handler
 * 
 * This module handles the creation of API keys for authenticated users and sets up
 * the necessary OpenMeter infrastructure for metered usage tracking and billing.
 * 
 * FUNCTIONALITY:
 * - Creates a new API key for the authenticated user via Zuplo's Key Management Service
 * - Sets up OpenMeter subjects, entitlements, customers, and subscriptions for new users
 * - Links the API key to the user's OpenMeter subject for usage tracking
 * - Assigns users to a default "free" plan (configurable)
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * - OPENMETER_API_KEY: Your OpenMeter API key for authenticating with OpenMeter Cloud
 * - ZUPLO_ACCOUNT_NAME: Your Zuplo account name (found in your Zuplo dashboard)
 * - API_KEY_SERVICE_BUCKET_NAME: The name of your Zuplo API key bucket
 * - ZUPLO_DEVELOPER_API_KEY: Your Zuplo developer API key for managing resources
 * 
 * SETUP NOTES:
 * - Ensure you have an OpenMeter account and have created a feature called "api_requests"
 * - Create a plan in OpenMeter (default: "free") that users will be subscribed to
 * - Configure your Zuplo API key bucket before using this handler
 * - This handler expects authenticated requests with user.sub and user.data populated
 */

import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";
import { OpenMeter } from '@openmeter/sdk'

const openmeter = new OpenMeter({
  baseUrl: 'https://openmeter.cloud',
  apiKey: environment.OPENMETER_API_KEY,
})

const accountName = environment.ZUPLO_ACCOUNT_NAME;
const bucketName = environment.ZUPLO_API_KEY_SERVICE_BUCKET_NAME;

export default async function (request: ZuploRequest, context: ZuploContext) {
  const sub = request.user?.sub;
  const userClaims = request.user?.data;
  const body = await request.json();

  if (!sub) {
    return new Response("User not authenticated", { status: 401 });
  }

  const apiKeyPromise = fetch(
    `https://dev.zuplo.com/v1/accounts/${accountName}/key-buckets/${bucketName}/consumers?with-api-key=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${environment.ZUPLO_DEVELOPER_API_KEY}`,
      },
      body: JSON.stringify({
        name: crypto.randomUUID(),
        managers: [
          { email: body.metadata?.email ?? "nobody@example.com", sub: sub },
        ],
        description: body.description ?? "API Key",
        tags: {
          sub: sub,
          email: body.metadata?.email,
        },
        metadata: {
          openmeter: {
            subjectId: sub
          }
        },
      }),
    }
  );

  // Check if subject already exists
  let subjectExists = false;
  try {
    await openmeter.subjects.get(sub);
    subjectExists = true;
  } catch (error) {
    // Subject doesn't exist, we'll create it
    subjectExists = false;
  }

  let setupPromises: Promise<any>[] = [];

  if (!subjectExists) {
    // Only run setup if subject doesn't exist
    const subjectPromise = openmeter.subjects.upsert({ key: sub });
    const createEntitlementForSubject = openmeter.entitlements.create(sub, {
      featureKey: "api_requests",
      type: "metered",
      usagePeriod: {
        interval: "MONTH"
      }
    });

    // Create customer
    const createCustomerPromise = openmeter.customers.create({
      name: body.metadata?.email ?? "Customer",
      description: `Customer for ${body.metadata?.email ?? sub}`,
      usageAttribution: {
        subjectKeys: [sub]
      },
      metadata: {
        email: body.metadata?.email,
        sub: sub
      }
    });

    // Create subscription for the customer
    const createSubscriptionPromise = createCustomerPromise.then(async (customer) => {
      return openmeter.subscriptions.create({
        customerId: customer.id,
        timing: "immediate",
        plan: {
          key: "free" // Default plan, can be configured
        }
      });
    });

    setupPromises = [subjectPromise, createEntitlementForSubject, createCustomerPromise, createSubscriptionPromise];
  }

  // Always wait for API key creation, plus setup promises if subject is new
  const allPromises = [apiKeyPromise, ...setupPromises];
  const results = await Promise.all(allPromises);
  const apiKeyResponse = results[0];

  return apiKeyResponse.json();
}
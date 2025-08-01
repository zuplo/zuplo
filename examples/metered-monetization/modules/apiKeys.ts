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

// OpenMeter API helper function
async function openMeterApiCall(endpoint: string, options: RequestInit = {}) {
  const baseUrl = 'https://openmeter.cloud';
  const url = `${baseUrl}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${environment.OPENMETER_API_KEY}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenMeter API error: ${response.status} ${response.statusText}`);
  }

  // Handle different response types
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

const accountName = environment.ZP_ACCOUNT_NAME;
const bucketName = environment.ZP_API_KEY_SERVICE_BUCKET_NAME;

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
        Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
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
    await openMeterApiCall(`/api/v1/subjects/${encodeURIComponent(sub)}`, {
      method: 'GET'
    });
    subjectExists = true;
  } catch (error) {
    // Subject doesn't exist, we'll create it
    subjectExists = false;
  }

  let setupPromises: Promise<any>[] = [];

  if (!subjectExists) {
    // Only run setup if subject doesn't exist
    const subjectPromise = openMeterApiCall('/api/v1/subjects', {
      method: 'POST',
      body: JSON.stringify({ key: sub })
    });
    const createEntitlementForSubject = openMeterApiCall(`/api/v1/subjects/${encodeURIComponent(sub)}/entitlements`, {
      method: 'POST',
      body: JSON.stringify({
        type: "metered",
        featureKey: "api_requests",
        issueAfterReset: 10,
        usagePeriod: {
          interval: "MONTH"
        },
        isSoftLimit: false
      })
    });

    // Create customer
    const createCustomerPromise = openMeterApiCall('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: body.metadata?.email ?? "Customer",
        key: sub,
        description: `Customer for ${body.metadata?.email ?? sub}`,
        usageAttribution: {
          subjectKeys: [sub]
        },
        metadata: {
          email: body.metadata?.email,
          sub: sub
        }
      })
    });

    // Create subscription for the customer
    const createSubscriptionPromise = createCustomerPromise.then(async (customer) => {
      return openMeterApiCall('/api/v1/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          timing: "immediate",
          plan: {
            key: "free" // Default plan, can be configured
          }
        })
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
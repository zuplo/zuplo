//module - ./modules/rate-limiter.ts

import {
  ContextData,
  CustomRateLimitDetails,
  HttpProblems,
  ZuploContext,
  ZuploRequest,
} from "@zuplo/runtime";

export async function customRateLimiter(
  request: ZuploRequest,
  context: ZuploContext,
) {
  // Invoke the rate limit policy
  const result = await context.invokeInboundPolicy(
    "rate-limit-inbound",
    request,
  );
  // Check if the result is a response
  if (result instanceof Response) {
    // If the response is a 429, we can customize the response
    if (result.status === 429) {
      // Get the rate limits from the context
      const rateLimits = ContextData.get(context, "rateLimits");
      // Customize the response
      return HttpProblems.tooManyRequests(request, context, {
        rateLimits,
      });
    }
  }
  // If the policy didn't return a response or its not a 429, return the result
  return result;
}

export function rateLimitKey(
  request: ZuploRequest,
  context: ZuploContext,
  policyName: string,
): CustomRateLimitDetails | undefined {
  const rateLimits: CustomRateLimitDetails = {
    key: "my-key", // Set this to something real like the request.user.sub, etc.
    requestsAllowed: 2,
    timeWindowMinutes: 1,
  };
  // Save the rate limit to the ContextData so we can use it in the response
  ContextData.set(context, "rateLimits", rateLimits);
  return rateLimits;
}

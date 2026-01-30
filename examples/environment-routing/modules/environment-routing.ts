import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

/**
 * Routes requests to different backends based on API key metadata.
 *
 * This policy reads the "environment" field from the authenticated user's
 * API key metadata and sets the appropriate backend URL.
 *
 * API keys should include metadata like: {"environment": "sandbox"} or
 * {"environment": "production"}
 */
export default async function policy(
  request: ZuploRequest,
  context: ZuploContext,
) {
  // After API key auth, user data is available on request.user
  // The "data" property contains the API key's metadata
  const userEnvironment = request.user?.data?.environment;

  if (userEnvironment === "sandbox") {
    // Set the backend URL for use by the URL rewrite handler
    context.custom.backendUrl = environment.SANDBOX_BACKEND_URL;
    context.log.info("Routing to sandbox environment");
  } else if (userEnvironment === "production") {
    context.custom.backendUrl = environment.PRODUCTION_BACKEND_URL;
    context.log.info("Routing to production environment");
  } else {
    // Reject requests with missing or invalid environment configuration
    context.log.warn(`Unknown or missing environment: ${userEnvironment}`);
    return new Response(
      JSON.stringify({
        error: "invalid_api_key",
        message: "API key is not configured for a valid environment",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Continue to the next policy or handler
  return request;
}
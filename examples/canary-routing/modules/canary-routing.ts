import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

/**
 * Routes requests to canary or production backends based on percentage
 * and user allow-list.
 *
 * Routing priority:
 * 1. Users in CANARY_USERS list always go to canary
 * 2. Requests with x-stage: canary header go to canary
 * 3. Remaining traffic is split by CANARY_PERCENTAGE
 *
 * Uses a hash of session ID or client IP for sticky routing, ensuring the same
 * client consistently hits the same backend.
 */
export default async function canaryRouting(
  request: ZuploRequest,
  context: ZuploContext
) {
  // Parse canary users from comma-separated env var
  const CANARY_USERS = environment.CANARY_USERS
    ? environment.CANARY_USERS.split(",").map((user) => user.trim())
    : [];

  // Check if user is in the canary allow-list
  const isCanaryUser =
    request.user?.sub && CANARY_USERS.includes(request.user.sub);

  if (isCanaryUser) {
    return routeToCanary(request, context, "user");
  }

  // Check for explicit canary header
  const stageHeader = request.headers.get("x-stage");
  if (stageHeader === "canary") {
    return routeToCanary(request, context, "header");
  }

  // Percentage-based routing for remaining traffic
  const CANARY_PERCENTAGE = parseInt(environment.CANARY_PERCENTAGE || "0", 10);

  if (CANARY_PERCENTAGE > 0 && environment.API_URL_CANARY) {
    const shouldRouteToCanary = await checkPercentageRouting(
      request,
      CANARY_PERCENTAGE
    );

    if (shouldRouteToCanary) {
      return routeToCanary(request, context, "percentage");
    }
  }

  // Default to production
  return routeToProduction(request, context);
}

/**
 * Determines if a request should go to canary based on percentage.
 * Uses a consistent hash so the same client always gets the same result.
 */
async function checkPercentageRouting(
  request: ZuploRequest,
  percentage: number
): Promise<boolean> {
  // Use session ID if available, otherwise fall back to client IP
  const sessionId =
    request.headers.get("x-session-id") ||
    request.headers.get("true-client-ip") ||
    "unknown";

  // Hash the session ID for consistent routing
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sessionId)
  );
  const hashArray = Array.from(new Uint8Array(hash));

  // Convert first byte to a value between 0-100
  const hashValue = (hashArray[0] / 255) * 100;

  return hashValue < percentage;
}

/**
 * Routes the request to the canary backend.
 */
function routeToCanary(
  request: ZuploRequest,
  context: ZuploContext,
  reason: "user" | "header" | "percentage"
) {
  if (!environment.API_URL_CANARY) {
    // Fall back to production if canary URL not configured
    context.log.warn("API_URL_CANARY not configured, falling back to production");
    return routeToProduction(request, context);
  }

  context.custom.backendUrl = environment.API_URL_CANARY;
  context.log.info("Routing to canary backend", {
    backend: "canary",
    reason,
    user: request.user?.sub,
  });

  return request;
}

/**
 * Routes the request to the production backend.
 */
function routeToProduction(request: ZuploRequest, context: ZuploContext) {
  context.custom.backendUrl = environment.API_URL_PRODUCTION;
  context.log.info("Routing to production backend", {
    backend: "production",
    user: request.user?.sub,
  });

  return request;
}
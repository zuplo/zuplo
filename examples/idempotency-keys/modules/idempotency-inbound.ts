import { ZuploContext, ZuploRequest, ZoneCache } from "@zuplo/runtime";

/**
 * Shape of the cached response we store in ZoneCache.
 * We only need the status code and body to replay the response.
 */
interface CachedResponse {
  status: number;
  body: string;
}

/**
 * Policy options passed from policies.json configuration.
 */
interface PolicyOptions {
  ttlSeconds: number; // How long to cache responses (in seconds)
}

/**
 * Idempotency Inbound Policy
 *
 * This policy intercepts incoming requests and checks if we've already
 * processed a request with the same Idempotency-Key. If so, we return
 * the cached response immediately without hitting the backend.
 *
 * Flow:
 * 1. Check for Idempotency-Key header - if missing, proceed normally
 * 2. Look up the key in ZoneCache
 * 3. If found: return the cached response with X-Idempotent-Replay header
 * 4. If not found: pass data to outbound policy via context.custom and continue
 */
export default async function (
  request: ZuploRequest,
  context: ZuploContext,
  options: PolicyOptions,
  policyName: string,
) {
  // Extract the idempotency key from the request headers
  const key = request.headers.get("Idempotency-Key");

  // No key provided - this request doesn't need idempotency handling
  // Let it proceed through the pipeline normally
  if (!key) {
    return request;
  }

  // ZoneCache is Zuplo's built-in distributed cache
  // It's low-latency and shared across the same data center
  // We namespace it as "idempotency" to keep these entries separate
  const cache = new ZoneCache<CachedResponse>("idempotency", context);

  // Check if we've already processed a request with this key
  const cached = await cache.get(key);

  if (cached) {
    // Cache hit! We've seen this idempotency key before.
    // Return the stored response instead of processing the request again.
    context.log.info(`Idempotency cache hit for key: ${key}`);

    return new Response(cached.body, {
      status: cached.status,
      headers: {
        "Content-Type": "application/json",
        // This header tells the client this is a replayed response
        "X-Idempotent-Replay": "true",
      },
    });
  }

  // Cache miss - this is a new idempotency key
  // Store the key and TTL in context.custom so the outbound policy
  // can cache the response after the handler completes
  context.custom.idempotencyKey = key;
  context.custom.idempotencyTtl = options.ttlSeconds;

  // Continue to the next policy or handler in the pipeline
  return request;
}
import { ZuploContext, ZuploRequest, ZoneCache } from "@zuplo/runtime";

/**
 * Shape of the cached response we store in ZoneCache.
 * Must match the interface used in the inbound policy.
 */
interface CachedResponse {
  status: number;
  body: string;
}

/**
 * Idempotency Outbound Policy
 *
 * This policy runs after the handler completes and caches successful
 * responses so future requests with the same Idempotency-Key can
 * skip processing entirely.
 *
 * Flow:
 * 1. Check if the inbound policy stored an idempotency key in context.custom
 * 2. If no key, return the response unchanged (no caching needed)
 * 3. If the response is successful (2xx), cache it with the configured TTL
 * 4. Return the response to the client
 *
 * Note: We only cache successful responses. Failed requests should be
 * retryable, so we don't want to cache and replay errors.
 */
export default async function (
  response: Response,
  request: ZuploRequest,
  context: ZuploContext,
) {
  // Retrieve the idempotency key and TTL that the inbound policy stored
  // These will be undefined if no Idempotency-Key header was provided
  const key = context.custom.idempotencyKey as string | undefined;
  const ttl = context.custom.idempotencyTtl as number | undefined;

  // No idempotency key was provided in the original request
  // Return the response unchanged
  if (!key || !ttl) {
    return response;
  }

  // Only cache successful responses (2xx status codes)
  // We don't want to cache errors because:
  // - Temporary failures (500, 503) should be retryable
  // - Client errors (400, 401) might succeed with corrected input
  if (response.status >= 200 && response.status < 300) {
    const cache = new ZoneCache<CachedResponse>("idempotency", context);

    // Read the response body so we can cache it
    // Note: This consumes the body stream, so we must create a new Response
    const body = await response.text();

    // Cache the response asynchronously using fire-and-forget pattern
    // We don't await this because we don't want to delay the response
    // Errors are logged but won't affect the client response
    cache.put(key, { status: response.status, body }, ttl).catch((err) =>
      context.log.error("Failed to cache idempotency response", err),
    );

    // Create a new Response since we consumed the original body
    // Preserve the original status and headers
    return new Response(body, {
      status: response.status,
      headers: response.headers,
    });
  }

  // Non-2xx response - return unchanged without caching
  return response;
}
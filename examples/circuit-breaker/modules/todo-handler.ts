import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * A request handler that proxies to the todo API, but returns a 500
 * when the x-simulate-failure header is present.
 *
 * Unlike an inbound policy, a handler's response flows through the
 * outbound policy pipeline, so the circuit breaker outbound policy
 * will count these failures.
 *
 * Remove this handler and switch back to urlForwardHandler before
 * deploying to production.
 */
export default async function (
  request: ZuploRequest,
  context: ZuploContext,
) {
  const shouldFail = request.headers.get("x-simulate-failure") === "true";

  if (shouldFail) {
    context.log.warn("Simulating backend failure (x-simulate-failure header).");

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Simulated backend failure for circuit breaker testing",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // Proxy to the real backend
  const url = new URL(request.url);
  const backendUrl = `https://todo.zuplo.io${url.pathname}${url.search}`;

  return fetch(backendUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}
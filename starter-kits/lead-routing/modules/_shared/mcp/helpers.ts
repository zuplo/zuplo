import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * MCP helpers for orchestrator tools (the "AI angle" tools that compose
 * multiple sibling routes via context.invokeRoute).
 */

/**
 * Invoke a sibling route by path and parse the JSON response, throwing a
 * descriptive error if the call fails. Use this in orchestrator handlers
 * to compose endpoints — keeps the request inside the gateway and inherits
 * the route's policies (rate limit, auth) automatically.
 *
 * @example
 * const overdue = await invokeJson<Invoice[]>(context, "/internal/invoices/overdue");
 */
export async function invokeJson<T = unknown>(
  context: ZuploContext,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await context.invokeRoute(path, init);
  if (!res.ok) {
    throw new Error(
      `Internal route ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * Standard JSON response wrapper for MCP tool results. MCP tool handlers
 * may return a plain JS object (Zuplo serializes it) or a Response — this
 * helper writes a consistent JSON+200 response with content-type set.
 */
export function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Standard error response shape for tool handlers. Returns a JSON envelope
 * with `error.type`, `error.message`. MCP clients display the body directly
 * when a tool fails.
 */
export function errorResponse(
  type: string,
  message: string,
  status = 400,
): Response {
  return new Response(
    JSON.stringify({ error: { type, message } }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

/**
 * Read JSON body safely from a tool handler request, returning typed input
 * or a 400 response if parsing fails. MCP-driven calls are JSON, so failures
 * here are rare — but useful for defensive code.
 */
export async function readJsonBody<T = unknown>(
  request: ZuploRequest,
): Promise<{ ok: true; body: T } | { ok: false; response: Response }> {
  try {
    const body = (await request.json()) as T;
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: errorResponse("invalid_body", "Request body is not valid JSON.", 400),
    };
  }
}

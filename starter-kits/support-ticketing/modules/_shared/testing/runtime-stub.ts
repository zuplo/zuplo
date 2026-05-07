/**
 * Stub of `@zuplo/runtime`'s public exports for unit tests.
 *
 * Wired in via vitest's `resolve.alias` (see `_shared/testing/vitest.config.ts`).
 * The real runtime ships gateway-only initialization at module load that
 * crashes in plain Node, so kit tests substitute this lightweight surface.
 *
 * Only what kits actually use is exported. If a kit's handler reaches for
 * a runtime export that isn't here, add it.
 */

export const environment = (() => {
  const env: Record<string, string | undefined> = {};
  if (typeof process !== "undefined" && process.env) {
    for (const [k, v] of Object.entries(process.env)) env[k] = v;
  }
  return env;
})();

export class ZuploRequest extends Request {}

export class ZuploContext {
  contextId = "test-context";
  requestId = "test-request";
  log = console;
  custom: Record<string, unknown> = {};
  waitUntil() {}
  async invokeRoute(): Promise<Response> {
    return new Response(null, { status: 501 });
  }
}

export const HttpProblems = {
  badRequest: (_ctx: unknown, opts?: { detail?: string }) =>
    new Response(
      JSON.stringify({ type: "about:blank", title: "Bad Request", status: 400, detail: opts?.detail }),
      { status: 400, headers: { "content-type": "application/problem+json" } },
    ),
  notFound: (_ctx: unknown, opts?: { detail?: string }) =>
    new Response(
      JSON.stringify({ type: "about:blank", title: "Not Found", status: 404, detail: opts?.detail }),
      { status: 404, headers: { "content-type": "application/problem+json" } },
    ),
};

export const ProblemJsonResponse = Response;

export const Logger = console;

export class InboundPolicy {}
export class OutboundPolicy {}

export const ApiKeyInboundPolicy = () => async (req: Request) => req;
export const RateLimitInboundPolicy = () => async (req: Request) => req;

export type ZuploRequestInit = RequestInit & {
  params?: Record<string, string>;
  user?: unknown;
};

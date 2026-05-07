import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * A minimal mock for `ZuploContext` covering the surface that handlers and
 * orchestrator MCP tools actually use:
 *
 *   - `context.log.{info,warn,error,debug}`
 *   - `context.invokeRoute(path, init)` — dispatched to a route map
 *   - `context.waitUntil(promise)` — captured for assertions
 *
 * The real `MockZuploContext` from `@zuplo/runtime/mocks` works too, but it
 * pulls in the full event/emitter machinery; this is lighter for unit tests.
 *
 * @example
 * const context = makeContext({
 *   routes: {
 *     "GET /invoices": listInvoicesHandler,
 *     "POST /invoices": createInvoiceHandler,
 *   },
 * });
 */
export interface RouteMap {
  /** Keyed by `"<METHOD> <path>"`, e.g. `"POST /invoices"`. */
  [key: string]: (request: ZuploRequest, context: ZuploContext) => Promise<Response> | Response;
}

export interface MakeContextOptions {
  routes?: RouteMap;
  log?: Partial<ZuploContext["log"]>;
  /** Default tenant for invoked routes — copied to the inner request's `user.data`. */
  tenantId?: string;
}

export interface MockContext {
  context: ZuploContext;
  /** Promises captured by `context.waitUntil()`. Awaitable as a group. */
  background: Promise<unknown>[];
  /** Log lines captured during the test. */
  logs: { level: string; messages: unknown[] }[];
  /** Calls to `invokeRoute()` — useful for asserting fan-out behavior. */
  invokeCalls: { path: string; method: string }[];
}

export function makeContext(options: MakeContextOptions = {}): MockContext {
  const background: Promise<unknown>[] = [];
  const logs: { level: string; messages: unknown[] }[] = [];
  const invokeCalls: { path: string; method: string }[] = [];
  const routes = options.routes ?? {};

  const log = {
    debug: (...m: unknown[]) => logs.push({ level: "debug", messages: m }),
    info: (...m: unknown[]) => logs.push({ level: "info", messages: m }),
    log: (...m: unknown[]) => logs.push({ level: "log", messages: m }),
    warn: (...m: unknown[]) => logs.push({ level: "warn", messages: m }),
    error: (...m: unknown[]) => logs.push({ level: "error", messages: m }),
    ...(options.log ?? {}),
  };

  const context = {
    contextId: "test-context",
    requestId: "test-request",
    log,
    custom: {},
    waitUntil(promise: Promise<unknown>) {
      background.push(promise);
    },
    async invokeRoute(input: string | URL | Request, init?: RequestInit): Promise<Response> {
      const inputUrl =
        typeof input === "string"
          ? new URL(input, "https://kit.test")
          : input instanceof URL
            ? input
            : new URL(input.url);
      const method = (init?.method ?? "GET").toUpperCase();
      const pathname = inputUrl.pathname;
      invokeCalls.push({ path: pathname + inputUrl.search, method });

      const handler = matchRoute(routes, method, pathname);
      if (!handler) {
        return new Response(
          JSON.stringify({ error: { type: "not_found", path: pathname, method } }),
          { status: 404, headers: { "content-type": "application/json" } },
        );
      }

      const params = handler.params;
      const innerHeaders = new Headers(init?.headers ?? {});
      const innerRequest = new Request(inputUrl, {
        method,
        headers: innerHeaders,
        body: init?.body ?? undefined,
      }) as Request & {
        params?: Record<string, string>;
        user?: { sub: string; data: Record<string, unknown> };
      };
      innerRequest.params = params;
      const tenantId = options.tenantId;
      if (tenantId !== undefined) {
        innerRequest.user = { sub: "test-key", data: { tenantId } };
      }
      return handler.handler(innerRequest as ZuploRequest, context as ZuploContext);
    },
  } as unknown as ZuploContext;

  return { context, background, logs, invokeCalls };
}

interface MatchedRoute {
  handler: (request: ZuploRequest, context: ZuploContext) => Promise<Response> | Response;
  params: Record<string, string>;
}

function matchRoute(routes: RouteMap, method: string, pathname: string): MatchedRoute | null {
  for (const key of Object.keys(routes)) {
    const [routeMethod, ...rest] = key.split(" ");
    const routePath = rest.join(" ");
    if (routeMethod !== method) continue;
    const params = matchPath(routePath, pathname);
    if (params) return { handler: routes[key], params };
  }
  return null;
}

function matchPath(routePath: string, actual: string): Record<string, string> | null {
  const routeParts = routePath.split("/").filter(Boolean);
  const actualParts = actual.split("/").filter(Boolean);
  if (routeParts.length !== actualParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < routeParts.length; i++) {
    const r = routeParts[i];
    const a = actualParts[i];
    const match = r.match(/^[:{](.+?)[}]?$/);
    if (match) {
      params[match[1]] = decodeURIComponent(a);
    } else if (r !== a) {
      return null;
    }
  }
  return params;
}

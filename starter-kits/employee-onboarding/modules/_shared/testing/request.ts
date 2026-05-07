import type { ZuploRequest } from "@zuplo/runtime";

/**
 * Build a `ZuploRequest`-shaped object suitable for passing to a handler in a
 * vitest test. We don't use the real `ZuploRequest` class because it requires
 * the gateway runtime; instead we attach the `user` and `params` properties
 * to a plain `Request` and cast.
 *
 * @example
 * const request = makeRequest({
 *   url: "https://kit.test/invoices",
 *   method: "POST",
 *   body: { amount: 100 },
 *   tenantId: "tenant-a",
 * });
 * const response = await handler(request, context);
 */
export interface MakeRequestOptions {
  /** Full URL or path. Defaults to `https://kit.test/`. */
  url?: string;
  method?: string;
  /** JSON body — gets serialized and content-type set. */
  body?: unknown;
  /** Raw body string (overrides `body`). */
  rawBody?: string;
  headers?: Record<string, string>;
  /** Path params (e.g. `{ id: "abc" }` for `/items/{id}`). */
  params?: Record<string, string>;
  /** Tenant ID — populates `request.user.data.tenantId`. */
  tenantId?: string;
  /** Additional user.data fields. Merged with `tenantId`. */
  userData?: Record<string, unknown>;
  /** Anonymous request — skips populating `request.user`. */
  anonymous?: boolean;
}

export function makeRequest(options: MakeRequestOptions = {}): ZuploRequest {
  const url = options.url ?? "https://kit.test/";
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers ?? {});

  let bodyInit: BodyInit | undefined;
  if (options.rawBody !== undefined) {
    bodyInit = options.rawBody;
  } else if (options.body !== undefined) {
    bodyInit = JSON.stringify(options.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }

  const init: RequestInit = { method, headers };
  if (bodyInit !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = bodyInit;
  }

  const request = new Request(url, init) as Request & {
    params?: Record<string, string>;
    user?: { sub: string; data: Record<string, unknown> };
  };

  request.params = options.params ?? {};

  if (!options.anonymous) {
    const data: Record<string, unknown> = {
      ...(options.userData ?? {}),
    };
    if (options.tenantId !== undefined) data.tenantId = options.tenantId;
    request.user = { sub: "test-key", data };
  }

  return request as ZuploRequest;
}

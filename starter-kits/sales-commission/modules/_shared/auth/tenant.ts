import type { ZuploRequest } from "@zuplo/runtime";

/**
 * Tenant resolution and enforcement.
 *
 * The `api-key-inbound` policy populates `request.user.data` with metadata
 * stored on the API key. Kits store `tenantId` there at key creation time,
 * and these helpers extract it on every request.
 */

export interface AuthenticatedUserData {
  tenantId?: string;
  [key: string]: unknown;
}

/**
 * Extract the tenantId from the authenticated request, or throw a 401-ready
 * Error if absent. Use this at the top of every handler.
 *
 * @example
 * export default async function (request: ZuploRequest, context: ZuploContext) {
 *   const tenantId = requireTenant(request);
 *   const items = await invoiceRepository.list(tenantId);
 *   return new Response(JSON.stringify(items));
 * }
 */
export function requireTenant(request: ZuploRequest): string {
  const data = (request.user?.data ?? {}) as AuthenticatedUserData;
  if (typeof data.tenantId === "string" && data.tenantId.length > 0) {
    return data.tenantId;
  }
  throw new TenantMissingError();
}

/**
 * Soft variant: returns tenantId or null. Use only in policies/middleware
 * that explicitly handle the unauthenticated case.
 */
export function getTenant(request: ZuploRequest): string | null {
  const data = (request.user?.data ?? {}) as AuthenticatedUserData;
  return typeof data.tenantId === "string" && data.tenantId.length > 0
    ? data.tenantId
    : null;
}

/**
 * Thrown when a handler called requireTenant() but no tenant is present.
 * Wrap with the standard error response shape — see `tenantErrorResponse`.
 */
export class TenantMissingError extends Error {
  constructor() {
    super("No tenantId found on request. Ensure api-key-inbound is configured.");
    this.name = "TenantMissingError";
  }
}

/**
 * Standard 401 response for missing-tenant errors. Use in a try/catch around
 * handler logic, or in a Zuplo `onError` policy.
 */
export function tenantErrorResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        type: "unauthorized",
        message: "No tenant context. Provide an API key with tenantId metadata.",
      },
    }),
    {
      status: 401,
      headers: { "content-type": "application/json" },
    },
  );
}

import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { licenseRepository } from "../repositories/apps.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const saasAppSlug = url.searchParams.get("saasAppSlug");
  const employeeEmail = url.searchParams.get("employeeEmail");
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const page = await licenseRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "assignedAt", direction: "desc" },
  });

  let filtered = page.items;
  if (saasAppSlug) {
    filtered = filtered.filter((l) => l.saasAppSlug === saasAppSlug);
  }
  if (employeeEmail) {
    const lower = employeeEmail.toLowerCase();
    filtered = filtered.filter((l) => l.employeeEmail.toLowerCase() === lower);
  }

  return new Response(
    JSON.stringify({ items: filtered, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}

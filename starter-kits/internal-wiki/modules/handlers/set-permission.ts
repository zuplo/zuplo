import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  permissionRepository,
  type Permission,
} from "../repositories/permissions.ts";

interface Body {
  spaceSlug: string;
  employeeEmail: string;
  role: Permission["role"];
}

/**
 * Upsert a permission row. If a row already exists for the (spaceSlug,
 * employeeEmail) pair, update its role; otherwise create a new row.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  // Look for an existing row to update
  const page = await permissionRepository.list(tenantId, { limit: 200 });
  const existing = page.items.find(
    (p) =>
      p.spaceSlug === body.spaceSlug && p.employeeEmail === body.employeeEmail,
  );

  if (existing) {
    const updated = await permissionRepository.update(tenantId, existing.id, {
      role: body.role,
      updatedAt: now,
    });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  }

  const created = await permissionRepository.create(tenantId, {
    spaceSlug: body.spaceSlug,
    employeeEmail: body.employeeEmail,
    role: body.role,
    updatedAt: now,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

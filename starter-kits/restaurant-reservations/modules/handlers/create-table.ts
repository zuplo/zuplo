import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { tableRepository, type Table } from "../repositories/tables.ts";

interface Body {
  number: string;
  capacity: number;
  location?: Table["location"];
  status?: Table["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await tableRepository.create(tenantId, {
    number: body.number,
    capacity: body.capacity,
    location: body.location ?? "main",
    status: body.status ?? "available",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

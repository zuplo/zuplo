import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { assetRepository, type Asset } from "../repositories/assets.ts";

interface Body {
  assetTag: string;
  kind: Asset["kind"];
  make: string;
  model: string;
  serialNumber: string;
  status?: Asset["status"];
  purchaseDate: string;
  purchaseCostCents: number;
  warrantyEndDate?: string | null;
  location: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await assetRepository.create(tenantId, {
    assetTag: body.assetTag,
    kind: body.kind,
    make: body.make,
    model: body.model,
    serialNumber: body.serialNumber,
    status: body.status ?? "in_stock",
    purchaseDate: body.purchaseDate,
    purchaseCostCents: body.purchaseCostCents,
    warrantyEndDate: body.warrantyEndDate ?? null,
    location: body.location,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

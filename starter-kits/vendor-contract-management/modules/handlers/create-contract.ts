import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { contractRepository, type Contract } from "../repositories/contracts.ts";

interface Body {
  vendorId: string;
  title: string;
  kind: Contract["kind"];
  startDate: string;
  endDate: string;
  autoRenews?: boolean;
  noticePeriodDays?: number;
  annualValueCents: number;
  currency?: string;
  status?: Contract["status"];
  documentUrl?: string | null;
  owner: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await contractRepository.create(tenantId, {
    vendorId: body.vendorId,
    title: body.title,
    kind: body.kind,
    startDate: body.startDate,
    endDate: body.endDate,
    autoRenews: body.autoRenews ?? false,
    noticePeriodDays: body.noticePeriodDays ?? 30,
    annualValueCents: body.annualValueCents,
    currency: body.currency ?? "USD",
    status: body.status ?? "draft",
    documentUrl: body.documentUrl ?? null,
    owner: body.owner,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

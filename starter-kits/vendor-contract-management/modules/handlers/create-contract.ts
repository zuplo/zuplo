import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { contractRepository, type Contract } from "../repositories/contracts.ts";
import { vendorRepository } from "../repositories/contracts.ts";
import { postSlackMessage } from "../integrations/slack.ts";

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

  // Resolve vendor name for the Slack message (best-effort).
  let vendorName = body.vendorId;
  try {
    const v = await vendorRepository.get(tenantId, body.vendorId);
    if (v) vendorName = v.name;
  } catch {
    // ignore — vendor may live in a different store / tenant linked elsewhere
  }

  // Notify the procurement channel.
  try {
    const valueDollars = (created.annualValueCents / 100).toFixed(0);
    await postSlackMessage({
      text: [
        `*New ${created.kind.toUpperCase()} uploaded:* ${created.title}`,
        `Vendor: ${vendorName}`,
        `Term: ${created.startDate} → ${created.endDate}`,
        `Annual value: ${created.currency} ${valueDollars}`,
        `Owner: ${created.owner}`,
        `Status: ${created.status}`,
        created.documentUrl ? `Document: ${created.documentUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (err) {
    context.log.warn(
      `Slack notify failed for contract ${created.id}: ${(err as Error).message}`,
    );
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

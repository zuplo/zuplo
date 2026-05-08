import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { vendorRepository, type Vendor } from "../repositories/contracts.ts";
import { postSlackMessage } from "../integrations/slack.ts";

interface Body {
  name: string;
  contactEmail: string;
  website?: string | null;
  category: string;
  status?: Vendor["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await vendorRepository.create(tenantId, {
    name: body.name,
    contactEmail: body.contactEmail,
    website: body.website ?? null,
    category: body.category,
    totalSpendCents: 0,
    status: body.status ?? "active",
  });

  // Notify the procurement channel so legal / finance can pick this up.
  try {
    await postSlackMessage({
      text: [
        `*New vendor onboarded:* ${created.name}`,
        `Category: ${created.category}`,
        `Contact: ${created.contactEmail}`,
        created.website ? `Website: ${created.website}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (err) {
    context.log.warn(
      `Slack notify failed for vendor ${created.id}: ${(err as Error).message}`,
    );
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

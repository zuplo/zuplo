import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { formRepository, type FormField } from "../repositories/forms.ts";

interface Body {
  name: string;
  slug: string;
  fields: FormField[];
  webhookUrl?: string;
  redirectUrl?: string;
  active?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await formRepository.create(tenantId, {
    name: body.name,
    slug: body.slug,
    fields: body.fields ?? [],
    webhookUrl: body.webhookUrl ?? null,
    redirectUrl: body.redirectUrl ?? null,
    active: body.active ?? true,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

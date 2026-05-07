import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  intakeFormRepository,
  type IntakeFormField,
} from "../repositories/intake-forms.ts";

interface Body {
  slug: string;
  name: string;
  fields: IntakeFormField[];
  targetVisitKind: string;
  active?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await intakeFormRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    fields: body.fields,
    targetVisitKind: body.targetVisitKind,
    active: body.active ?? true,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

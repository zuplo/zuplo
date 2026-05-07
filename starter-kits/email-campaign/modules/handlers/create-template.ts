import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { templateRepository } from "../repositories/templates.ts";

interface Body {
  name: string;
  subjectTemplate: string;
  htmlBody: string;
  textBody?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await templateRepository.create(tenantId, {
    name: body.name,
    subjectTemplate: body.subjectTemplate,
    htmlBody: body.htmlBody,
    textBody: body.textBody ?? "",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

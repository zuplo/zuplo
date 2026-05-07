import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { questionRepository, type Question } from "../repositories/surveys.ts";

interface Body {
  prompt: string;
  kind: Question["kind"];
  options?: string[];
  required?: boolean;
  displayOrder?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const surveyId = request.params.id;
  const body = (await request.json()) as Body;

  const created = await questionRepository.create(tenantId, {
    surveyId,
    prompt: body.prompt,
    kind: body.kind,
    options: body.options ?? [],
    required: body.required ?? false,
    displayOrder: body.displayOrder ?? 0,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { surveyRepository, type Survey } from "../repositories/surveys.ts";

interface Body {
  name: string;
  kind: Survey["kind"];
  question: string;
  sendCadence: Survey["sendCadence"];
  status?: Survey["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await surveyRepository.create(tenantId, {
    name: body.name,
    kind: body.kind,
    question: body.question,
    sendCadence: body.sendCadence,
    status: body.status ?? "active",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

import { HttpProblems, ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext,
) {
  const sub = request.user?.sub;

  if (typeof sub !== "string" || sub.length === 0) {
    context.log.warn("Unauthenticated request reached auth gate", {
      url: request.url,
      method: request.method,
    });
    return HttpProblems.unauthorized(request, context, {
      detail: "Authentication required.",
    });
  }

  return request;
}
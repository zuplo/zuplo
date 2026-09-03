import { HttpProblems, ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext,
) {
  // The `require-auth` member of the `dual-auth` composite policy is the real gate and
  // already rejects unauthenticated requests before this handler runs. This is a defensive
  // narrowing so `request.user` (typed optional) is safe to read below.
  if (!request.user) {
    return HttpProblems.unauthorized(request, context);
  }

  return {
    message: "Authenticated",
    sub: request.user.sub,
    data: request.user.data,
  };
}

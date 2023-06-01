import { HttpProblems, InboundPolicyHandler } from "@zuplo/runtime";

const setUser: InboundPolicyHandler<{ apiKey: string }> = async (
  request,
  context,
  options,
  policyName
) => {
  const userId = request.headers.get("user-id");
  if (userId) {
    request.user = {
      sub: userId,
      data: {},
    };
    return request;
  }
  return HttpProblems.unauthorized(request, context);
};

export default setUser;

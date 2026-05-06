import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext,
) {
  return {
    message: "Authenticated",
    sub: request.user.sub,
    data: request.user.data,
  };
}

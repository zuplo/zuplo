import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const authHeader = request.headers.get("fake-user");
  if (authHeader) {
    request.user = { sub: authHeader, data: {} };
  }
  return request;
}

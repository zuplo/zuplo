import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function echo(
  request: ZuploRequest,
  context: ZuploContext
) {
  const data = context.route.raw<{
    "x-custom": { hello: boolean };
    "x-internal": boolean;
    "x-flag": boolean;
  }>();
  return {
    custom: data["x-custom"],
    internal: data["x-internal"],
    flag: data["x-flag"],
  };
}

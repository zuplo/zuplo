import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function echo(
  request: ZuploRequest,
  context: ZuploContext
) {
  const data = context.route.raw<{
    "x-custom": { hello: boolean };
    "x-internal": boolean;
  }>();
  context.log.info(`My custom data: ${data["x-custom"]}`);
  if (data["x-internal"]) {
    return data["x-internal"];
  }
  return data["x-custom"];
}

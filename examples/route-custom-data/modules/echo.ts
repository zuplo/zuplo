import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function echo(
  request: ZuploRequest,
  context: ZuploContext
) {
  const data = context.route.raw<{ "x-custom": { hello: boolean } }>();
  context.log.info(`My custom data: ${data["x-custom"]}`);
  return data["x-custom"];
}

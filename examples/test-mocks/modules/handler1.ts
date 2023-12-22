import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const data = await request.json();

  context.log.info("A log message");

  return new Response(JSON.stringify(data, null, 2), { status: 200 });
}

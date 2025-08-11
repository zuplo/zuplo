import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

const accountName = environment.ZP_ACCOUNT_NAME;
const bucketName = environment.ZP_API_KEY_SERVICE_BUCKET_NAME;

export default async function (request: ZuploRequest, context: ZuploContext) {
  const sub = request.user?.sub;
  const userClaims = request.user?.data;
  const body = await request.json();

  const response = await fetch(
    `https://dev.zuplo.com/v1/accounts/${accountName}/key-buckets/${bucketName}/consumers?with-api-key=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
      },
      body: JSON.stringify({
        name: crypto.randomUUID(),
        managers: [
          { email: body.metadata?.email ?? "nobody@example.com", sub: sub },
        ],
        description: body.description ?? "API Key",
        tags: {
          sub: sub,
          email: body.metadata?.email,
        },
        metadata: {},
      }),
    }
  );

  return response.json();
}
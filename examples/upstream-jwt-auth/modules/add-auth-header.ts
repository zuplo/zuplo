import { ZuploContext, ZuploRequest, JwtServicePlugin } from "@zuplo/runtime";

type Options = {
  customClaims: any;
};

export default async function policy(
  request: ZuploRequest,
  context: ZuploContext,
  options: Options,
  policyName: string,
) {
  if (!request.user) {
    throw new Error("User is not authenticated");
  }

  const token = await JwtServicePlugin.signJwt({
    // Add the user claim
    user_id: request.user.sub,
    // Add any custom claims required from the user's auth token
    // or API key metadata
    account_id: request.user.data.accountId,
    // Add claims from the policy options
    ...options.customClaims,
  });

  const headers = new Headers(request.headers);

  // Set the Authorization header with the JWT token
  headers.set("Authorization", `Bearer ${token}`);

  return new Request(request, { headers });
}

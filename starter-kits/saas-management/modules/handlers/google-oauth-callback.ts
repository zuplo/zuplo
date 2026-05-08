import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";

/**
 * GET /oauth/google/callback
 *
 * Receives Google's OAuth `code` and exchanges it for a refresh token. The
 * resulting token must be saved as `GOOGLE_REFRESH_TOKEN` in your Zuplo env
 * vars before `discover_apps` will work against Google Workspace.
 *
 * In production, surface the resulting refresh token to your secrets manager
 * — never echo it to the browser. This handler returns a one-time success
 * page with the token redacted.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(
      JSON.stringify({ error: { type: "oauth", message: error } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (!code) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "missing `code`" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const clientId = environment.GOOGLE_CLIENT_ID;
  const clientSecret = environment.GOOGLE_CLIENT_SECRET;
  const redirectUri = environment.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return new Response(
      JSON.stringify({
        error: {
          type: "config",
          message: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI are required",
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    return new Response(
      JSON.stringify({
        error: { type: "oauth", message: `Google token exchange failed: ${res.status}` },
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    scope: string;
    expires_in: number;
  };
  if (!json.refresh_token) {
    return new Response(
      JSON.stringify({
        error: {
          type: "oauth",
          message:
            "Google did not return a refresh_token. Ensure access_type=offline and prompt=consent on the consent URL.",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  context.log.info(
    `Google OAuth: refresh_token issued. Persist as GOOGLE_REFRESH_TOKEN. Scopes: ${json.scope}`,
  );
  return new Response(
    JSON.stringify({
      ok: true,
      message:
        "Save the refresh_token below as GOOGLE_REFRESH_TOKEN in your Zuplo env vars.",
      refresh_token: json.refresh_token,
      scope: json.scope,
    }),
    { headers: { "content-type": "application/json" } },
  );
}

import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";

/**
 * GET /oauth/microsoft/callback
 *
 * Receives Microsoft Entra's OAuth `code` and exchanges it for tokens. For
 * the SaaS management discovery flow we use the client-credentials grant
 * (configured via `MICROSOFT_CLIENT_SECRET`), so this handler exists mainly
 * to confirm admin consent and to surface tokens during initial setup.
 *
 * In production, complete admin consent via the v2.0 admin-consent URL:
 *   https://login.microsoftonline.com/{tenant}/adminconsent?
 *     client_id={MICROSOFT_CLIENT_ID}
 *     &redirect_uri={MICROSOFT_REDIRECT_URI}
 * After consent, Microsoft redirects here. No token exchange is needed —
 * subsequent Graph calls use the client-credentials flow inside
 * `getMicrosoftGraphToken()`.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const adminConsent = url.searchParams.get("admin_consent");
  const tenant = url.searchParams.get("tenant");
  const code = url.searchParams.get("code");

  if (error) {
    context.log.warn(`Microsoft OAuth error: ${error} — ${errorDescription}`);
    return new Response(
      JSON.stringify({ error: { type: "oauth", message: errorDescription ?? error } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  if (adminConsent === "True" && tenant) {
    context.log.info(`Microsoft admin consent granted for tenant ${tenant}`);
    return new Response(
      JSON.stringify({
        ok: true,
        message:
          "Admin consent granted. Set MICROSOFT_TENANT_ID to the tenant id below; the client-credentials flow will then succeed.",
        tenantId: tenant,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  if (!code) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "missing `code` or admin_consent" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const clientId = environment.MICROSOFT_CLIENT_ID;
  const clientSecret = environment.MICROSOFT_CLIENT_SECRET;
  const tenantId = environment.MICROSOFT_TENANT_ID;
  const redirectUri = environment.MICROSOFT_REDIRECT_URI;
  if (!clientId || !clientSecret || !tenantId || !redirectUri) {
    return new Response(
      JSON.stringify({
        error: {
          type: "config",
          message:
            "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID / MICROSOFT_REDIRECT_URI are required",
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params,
    },
  );
  if (!res.ok) {
    return new Response(
      JSON.stringify({
        error: { type: "oauth", message: `Microsoft token exchange failed: ${res.status}` },
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return new Response(
    JSON.stringify({
      ok: true,
      message:
        "Tokens issued. For long-running discovery, prefer client-credentials — no refresh token needed.",
      tokenIssued: Boolean(json.access_token),
      hasRefreshToken: Boolean(json.refresh_token),
    }),
    { headers: { "content-type": "application/json" } },
  );
}

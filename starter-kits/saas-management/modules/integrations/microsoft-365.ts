import { environment } from "@zuplo/runtime";

/**
 * Microsoft 365 / Entra ID via Microsoft Graph.
 *
 * Provides:
 *   1. Client-credentials OAuth flow against the tenant.
 *   2. Listing assigned licenses on subscribed SKUs (`/subscribedSkus`) — the
 *      authoritative source for "how many seats does this tenant own and how
 *      many are assigned".
 *   3. Listing OAuth-consented apps (servicePrincipals where appOwnerOrganizationId
 *      is *not* the home tenant) so we can auto-discover SaaS apps employees
 *      have logged into.
 *
 * Required Graph application permissions (admin consent):
 *   - Directory.Read.All
 *   - Application.Read.All
 *
 * Docs:
 *   - https://learn.microsoft.com/graph/api/subscribedsku-list
 *   - https://learn.microsoft.com/graph/api/serviceprincipal-list
 */

const GRAPH_API = "https://graph.microsoft.com/v1.0";

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: "Bearer";
}

/**
 * Acquire a client-credentials access token for Graph against the configured
 * tenant.
 */
export async function getMicrosoftGraphToken(): Promise<string> {
  const tenantId = environment.MICROSOFT_TENANT_ID;
  const clientId = environment.MICROSOFT_CLIENT_ID;
  const clientSecret = environment.MICROSOFT_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are required",
    );
  }
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as AccessTokenResponse;
  return json.access_token;
}

export interface SubscribedSku {
  /** Unique SKU id (e.g. `ENTERPRISEPACK`). */
  skuPartNumber: string;
  /** Friendly name when available. */
  skuId: string;
  /** Total seats purchased. */
  totalSeats: number;
  /** Seats currently assigned to a user. */
  consumedUnits: number;
  /** Seats not yet active or in warning. */
  capabilityStatus: string;
}

/**
 * List Microsoft 365 SKUs the tenant owns plus their seat utilisation.
 * Each SKU becomes a candidate SaaS app to register.
 */
export async function listSubscribedSkus(): Promise<SubscribedSku[]> {
  const token = await getMicrosoftGraphToken();
  const res = await fetch(`${GRAPH_API}/subscribedSkus`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Graph subscribedSkus failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    value: Array<{
      skuPartNumber: string;
      skuId: string;
      prepaidUnits: { enabled: number };
      consumedUnits: number;
      capabilityStatus: string;
    }>;
  };
  return json.value.map((sku) => ({
    skuPartNumber: sku.skuPartNumber,
    skuId: sku.skuId,
    totalSeats: sku.prepaidUnits.enabled,
    consumedUnits: sku.consumedUnits,
    capabilityStatus: sku.capabilityStatus,
  }));
}

export interface ConsentedApp {
  appId: string;
  displayName: string;
  publisherName: string | null;
  /** Whether the app is signed in by users in this tenant. */
  signInAudience: string;
}

/**
 * List third-party service principals — i.e. SaaS apps the tenant's users
 * have consented to. Filters out Microsoft-first-party apps so the result is
 * (mostly) external SaaS for shadow-IT discovery.
 */
export async function listConsentedThirdPartyApps(): Promise<ConsentedApp[]> {
  const token = await getMicrosoftGraphToken();
  const apps: ConsentedApp[] = [];
  // Filter: tag eq 'WindowsAzureActiveDirectoryIntegratedApp' would scope to
  // gallery apps; here we drop Microsoft itself by appOwnerOrganizationId.
  let url:
    | string
    | undefined =
    `${GRAPH_API}/servicePrincipals?$select=appId,displayName,publisherName,signInAudience,appOwnerOrganizationId,servicePrincipalType&$top=200`;
  while (url) {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Graph servicePrincipals failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      value: Array<{
        appId: string;
        displayName: string;
        publisherName?: string;
        signInAudience: string;
        appOwnerOrganizationId?: string;
        servicePrincipalType?: string;
      }>;
      "@odata.nextLink"?: string;
    };
    for (const sp of json.value) {
      // Microsoft first-party tenantId is f8cdef31-a31e-4b4a-93e4-5f571e91255a.
      if (sp.appOwnerOrganizationId === "f8cdef31-a31e-4b4a-93e4-5f571e91255a") continue;
      // Skip ManagedIdentity / system identities.
      if (sp.servicePrincipalType && sp.servicePrincipalType !== "Application") continue;
      apps.push({
        appId: sp.appId,
        displayName: sp.displayName,
        publisherName: sp.publisherName ?? null,
        signInAudience: sp.signInAudience,
      });
    }
    url = json["@odata.nextLink"];
  }
  return apps;
}

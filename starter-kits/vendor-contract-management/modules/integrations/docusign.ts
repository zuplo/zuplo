import { environment } from "@zuplo/runtime";

/**
 * DocuSign eSignature integration.
 *
 * Two responsibilities:
 *   1. Mint an access token via the JWT grant flow (DocuSign's
 *      service-account auth — works without a user-driven OAuth dance,
 *      which is what we want from edge handlers).
 *   2. Create envelopes from an existing document URL or inline base64.
 *
 * Docs:
 *   - https://developers.docusign.com/platform/auth/jwt/jwt-grant-token/
 *   - https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopes/create/
 *
 * NOTE on JWT signing: DocuSign uses RS256, which Web Crypto supports via
 * SubtleCrypto.importKey + sign. Provide DOCUSIGN_PRIVATE_KEY as PKCS#8 PEM.
 * (For convenience env vars below accept the PEM with literal `\n` for
 * newlines.)
 */

interface AccessToken {
  access_token: string;
  expires_in: number;
}

/** Mint a DocuSign access token via the JWT grant flow. */
export async function getDocusignAccessToken(): Promise<{
  accessToken: string;
  baseUri: string;
  accountId: string;
}> {
  const integrationKey = environment.DOCUSIGN_INTEGRATION_KEY;
  const userId = environment.DOCUSIGN_USER_ID;
  const accountId = environment.DOCUSIGN_ACCOUNT_ID;
  const privateKey = environment.DOCUSIGN_PRIVATE_KEY;
  const oauthHost = environment.DOCUSIGN_OAUTH_HOST ?? "account-d.docusign.com";
  const apiBaseUri = environment.DOCUSIGN_API_BASE_URI ?? "https://demo.docusign.net/restapi";
  if (!integrationKey || !userId || !accountId || !privateKey) {
    throw new Error(
      "DOCUSIGN_INTEGRATION_KEY / DOCUSIGN_USER_ID / DOCUSIGN_ACCOUNT_ID / DOCUSIGN_PRIVATE_KEY are required",
    );
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: integrationKey,
      sub: userId,
      aud: oauthHost,
      iat: now,
      exp: now + 3600,
      scope: "signature impersonation",
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = await rsaSha256Sign(privateKey.replace(/\\n/g, "\n"), signingInput);
  const jwt = `${signingInput}.${base64UrlEncodeBytes(signature)}`;

  const res = await fetch(`https://${oauthHost}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`DocuSign JWT grant failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as AccessToken;
  return { accessToken: json.access_token, baseUri: apiBaseUri, accountId };
}

export interface CreateEnvelopeRequest {
  /** Internal contract id for our records — surfaces in webhook callbacks. */
  contractId: string;
  /** Document name shown in the envelope. */
  documentName: string;
  /** Either a public URL we'll fetch, or inline base64 bytes. */
  documentUrl?: string;
  documentBase64?: string;
  /** MIME type of the document — defaults to application/pdf. */
  mimeType?: string;
  /** Email + name of each signer in order. */
  signers: Array<{ email: string; name: string }>;
  /** Optional subject line / body for the email DocuSign sends. */
  emailSubject?: string;
  emailBlurb?: string;
}

export interface EnvelopeResult {
  envelopeId: string;
  status: string;
  uri: string;
  statusDateTime: string;
}

/** Create a DocuSign envelope and send it for signature. */
export async function createDocusignEnvelope(
  req: CreateEnvelopeRequest,
): Promise<EnvelopeResult> {
  const { accessToken, baseUri, accountId } = await getDocusignAccessToken();

  let documentBase64 = req.documentBase64;
  if (!documentBase64 && req.documentUrl) {
    const docRes = await fetch(req.documentUrl);
    if (!docRes.ok) {
      throw new Error(`Document fetch failed: ${docRes.status}`);
    }
    const bytes = new Uint8Array(await docRes.arrayBuffer());
    documentBase64 = bytesToBase64(bytes);
  }
  if (!documentBase64) {
    throw new Error("createDocusignEnvelope: provide documentUrl or documentBase64");
  }

  const body = {
    emailSubject: req.emailSubject ?? `Please sign: ${req.documentName}`,
    emailBlurb: req.emailBlurb ?? "",
    status: "sent",
    customFields: {
      textCustomFields: [
        { name: "contractId", value: req.contractId, show: "false" },
      ],
    },
    documents: [
      {
        documentBase64,
        name: req.documentName,
        fileExtension: (req.mimeType ?? "application/pdf").split("/")[1] ?? "pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers: req.signers.map((s, idx) => ({
        email: s.email,
        name: s.name,
        recipientId: String(idx + 1),
        routingOrder: String(idx + 1),
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sn1/",
              anchorXOffset: "0",
              anchorYOffset: "0",
              anchorUnits: "pixels",
              anchorIgnoreIfNotPresent: "true",
            },
          ],
        },
      })),
    },
  };
  const res = await fetch(
    `${baseUri}/v2.1/accounts/${encodeURIComponent(accountId)}/envelopes`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`DocuSign envelope create failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as EnvelopeResult;
}

// ── helpers ─────────────────────────────────────────────────────────────

function base64UrlEncode(s: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(s));
}

function base64UrlEncodeBytes(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return bytesToBase64(arr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToBase64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

async function rsaSha256Sign(pemPrivateKey: string, data: string): Promise<ArrayBuffer> {
  const der = pemToDer(pemPrivateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(data));
}

function pemToDer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN[^-]+-----/g, "")
    .replace(/-----END[^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

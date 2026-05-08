import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { consentRepository } from "../repositories/consents.ts";

/**
 * DocuSign Connect webhook — POST /webhooks/docusign.
 *
 * Verifies the inbound webhook with DocuSign Connect HMAC, parses the
 * envelope event, and on `envelope-completed` materializes a Consent
 * row from the prefill metadata (patientId / consentKind / version)
 * we attached when sending the envelope.
 *
 * DocuSign Connect HMAC docs:
 *   https://developers.docusign.com/platform/webhooks/connect/hmac/
 */

async function verifyDocuSignSignature(
  rawBody: string,
  signatureHeader: string | null,
  hmacKey: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(hmacKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const bytes = new Uint8Array(sig);
  const expected = btoa(String.fromCharCode(...bytes));
  return signatureHeader === expected;
}

interface DocuSignWebhookData {
  event?: string;
  data?: {
    envelopeId?: string;
    envelopeSummary?: {
      status?: string;
      completedDateTime?: string;
      customFields?: {
        textCustomFields?: Array<{ name: string; value: string }>;
      };
      recipients?: {
        signers?: Array<{
          customFields?: string[];
          tabs?: {
            textTabs?: Array<{ tabLabel: string; value: string }>;
          };
        }>;
      };
    };
  };
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId =
    request.headers.get("x-tenant-id") ?? environment.DEFAULT_TENANT_ID ?? "default";

  const rawBody = await request.text();

  const hmacKey = environment.DOCUSIGN_HMAC_KEY;
  if (hmacKey) {
    const ok = await verifyDocuSignSignature(
      rawBody,
      request.headers.get("x-docusign-signature-1"),
      hmacKey,
    );
    if (!ok) {
      return new Response(
        JSON.stringify({ error: "invalid_signature" }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
  }

  let payload: DocuSignWebhookData;
  try {
    payload = JSON.parse(rawBody) as DocuSignWebhookData;
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  if (payload.event !== "envelope-completed") {
    return new Response(JSON.stringify({ ok: true, ignored: payload.event }), {
      headers: { "content-type": "application/json" },
    });
  }

  const tabs =
    payload.data?.envelopeSummary?.recipients?.signers?.[0]?.tabs?.textTabs ??
    [];
  const tabMap = new Map(tabs.map((t) => [t.tabLabel, t.value]));

  const patientId = tabMap.get("patientId");
  const consentKind = tabMap.get("consentKind");
  const version = tabMap.get("consentVersion") ?? "1.0";

  if (!patientId || !consentKind) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: "Envelope completed but patientId/consentKind missing",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const created = await consentRepository.create(tenantId, {
    patientId,
    kind: consentKind as "treatment" | "hipaa" | "telehealth" | "research",
    version,
    signedAt:
      payload.data?.envelopeSummary?.completedDateTime ??
      new Date().toISOString(),
    withdrawnAt: null,
  });

  return new Response(
    JSON.stringify({ ok: true, consentId: created.id }),
    { headers: { "content-type": "application/json" } },
  );
}

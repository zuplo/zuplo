import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import docusignWebhook from "../modules/handlers/docusign-webhook.ts";
import {
  signatureEnvelopeRepository,
  type SignatureEnvelope,
} from "../modules/repositories/matters.ts";

const env = environment as Record<string, string | undefined>;

/**
 * DocuSign Connect signs requests with HMAC-SHA256 over the raw body, then
 * sends the base64-encoded signature in `X-DocuSign-Signature-1`.
 */
async function dsSign(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const bytes = new Uint8Array(sig);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function seedTracker(
  tenantId: string,
  envelopeId: string,
): Promise<SignatureEnvelope> {
  return signatureEnvelopeRepository.create(tenantId, {
    matterId: "m_x",
    documentId: null,
    envelopeId,
    subject: "Sign me",
    signerEmails: ["client@example.com"],
    status: "sent",
    sentAt: new Date().toISOString(),
    completedAt: null,
    createdAt: new Date().toISOString(),
  });
}

describe("webhook: /webhooks/docusign", () => {
  const secret = "ds-connect-secret-test";

  afterEach(() => {
    vi.restoreAllMocks();
    delete env.DOCUSIGN_CONNECT_SECRET;
  });

  it("with a valid signature, updates the matching envelope row to status=completed", async () => {
    env.DOCUSIGN_CONNECT_SECRET = secret;
    const tenantId = "tenant-ds-webhook-1";
    const tracker = await seedTracker(tenantId, "env_completed_1");

    const rawBody = JSON.stringify({
      event: "envelope-completed",
      data: {
        envelopeId: "env_completed_1",
        envelopeSummary: {
          status: "completed",
          statusChangedDateTime: "2026-02-05T00:00:00Z",
          customFields: {
            textCustomFields: [
              { name: "tenantId", value: tenantId },
              { name: "matterId", value: "m_x" },
            ],
          },
        },
      },
    });
    const signature = await dsSign(rawBody, secret);

    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody,
      headers: {
        "x-docusign-signature-1": signature,
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { tracked: boolean; status: string };
    expect(json.tracked).toBe(true);
    expect(json.status).toBe("completed");

    // Repo row was updated.
    const stored = await signatureEnvelopeRepository.get(tenantId, tracker.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.completedAt).toBe("2026-02-05T00:00:00Z");
  });

  it("rejects a request with a tampered signature (401) and does not mutate state", async () => {
    env.DOCUSIGN_CONNECT_SECRET = secret;
    const tenantId = "tenant-ds-webhook-tamper";
    const tracker = await seedTracker(tenantId, "env_tamper");

    const rawBody = JSON.stringify({
      event: "envelope-completed",
      data: {
        envelopeId: "env_tamper",
        envelopeSummary: {
          status: "completed",
          statusChangedDateTime: "2026-02-05T00:00:00Z",
          customFields: { textCustomFields: [{ name: "tenantId", value: tenantId }] },
        },
      },
    });

    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody,
      headers: {
        "x-docusign-signature-1": "deadbeef-not-a-real-signature",
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(401);

    // Tracker remained at the seeded "sent" state.
    const stored = await signatureEnvelopeRepository.get(tenantId, tracker.id);
    expect(stored?.status).toBe("sent");
    expect(stored?.completedAt).toBeNull();
  });

  it("rejects when the X-DocuSign-Signature-1 header is missing entirely (401)", async () => {
    env.DOCUSIGN_CONNECT_SECRET = secret;
    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody: "{}",
      headers: { "content-type": "application/json" },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(401);
  });

  it("returns 503 when DOCUSIGN_CONNECT_SECRET is not configured", async () => {
    delete env.DOCUSIGN_CONNECT_SECRET;
    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody: "{}",
      headers: {
        "x-docusign-signature-1": "anything",
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(503);
  });

  it("acks (200, ignored) for a valid signature with no tenantId customField", async () => {
    env.DOCUSIGN_CONNECT_SECRET = secret;

    const rawBody = JSON.stringify({
      event: "envelope-completed",
      data: {
        envelopeId: "env_no_tenant",
        envelopeSummary: { status: "completed", statusChangedDateTime: "2026-02-05T00:00:00Z" },
      },
    });
    const signature = await dsSign(rawBody, secret);

    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody,
      headers: {
        "x-docusign-signature-1": signature,
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ignored: boolean };
    expect(json.ignored).toBe(true);
  });

  it("acks (200, tracked=false) for an unknown envelopeId with valid signature", async () => {
    env.DOCUSIGN_CONNECT_SECRET = secret;
    const tenantId = "tenant-ds-webhook-unknown";

    const rawBody = JSON.stringify({
      event: "envelope-completed",
      data: {
        envelopeId: "env_unknown_to_us",
        envelopeSummary: {
          status: "completed",
          statusChangedDateTime: "2026-02-05T00:00:00Z",
          customFields: { textCustomFields: [{ name: "tenantId", value: tenantId }] },
        },
      },
    });
    const signature = await dsSign(rawBody, secret);

    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody,
      headers: {
        "x-docusign-signature-1": signature,
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { tracked: boolean };
    expect(json.tracked).toBe(false);
  });
});

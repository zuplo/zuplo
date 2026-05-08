import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import webhookDocusign from "../modules/handlers/webhook-docusign.ts";
import { makeContext } from "@zuplo/starter-kit-shared/testing";
import { consentRepository } from "../modules/repositories/consents.ts";

const HMAC_KEY = "test-hmac-secret";

const env = environment as Record<string, string | undefined>;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete env[name];
    delete process.env[name];
  } else {
    env[name] = value;
    process.env[name] = value;
  }
}

async function signBody(rawBody: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function clearConsents() {
  for (const tenantId of ["tenant-a", "tenant-b", "default"]) {
    const page = await consentRepository.list(tenantId, { limit: 200 });
    for (const item of page.items) {
      await consentRepository.delete(tenantId, item.id);
    }
  }
}

beforeEach(clearConsents);
afterEach(async () => {
  vi.restoreAllMocks();
  await clearConsents();
  setEnv("DOCUSIGN_HMAC_KEY", undefined);
  setEnv("DEFAULT_TENANT_ID", undefined);
});

function makeWebhookRequest(args: {
  body: string;
  signature?: string | null;
  tenantHeader?: string;
}): import("@zuplo/runtime").ZuploRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (args.signature !== null) {
    headers.set("x-docusign-signature-1", args.signature ?? "");
  }
  if (args.tenantHeader) headers.set("x-tenant-id", args.tenantHeader);
  const req = new Request("https://kit.test/webhooks/docusign", {
    method: "POST",
    headers,
    body: args.body,
  });
  return req as unknown as import("@zuplo/runtime").ZuploRequest;
}

describe("webhooks/docusign", () => {
  it("accepts a valid signature, materializes a Consent on envelope-completed", async () => {
    setEnv("DOCUSIGN_HMAC_KEY", HMAC_KEY);

    const payload = {
      event: "envelope-completed",
      data: {
        envelopeId: "env-1",
        envelopeSummary: {
          status: "completed",
          completedDateTime: "2025-12-01T00:00:00Z",
          recipients: {
            signers: [
              {
                tabs: {
                  textTabs: [
                    { tabLabel: "patientId", value: "pt-9001" },
                    { tabLabel: "consentKind", value: "hipaa" },
                    { tabLabel: "consentVersion", value: "2.1" },
                  ],
                },
              },
            ],
          },
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const sig = await signBody(rawBody, HMAC_KEY);

    const { context } = makeContext({});
    const request = makeWebhookRequest({
      body: rawBody,
      signature: sig,
      tenantHeader: "tenant-a",
    });
    const res = await webhookDocusign(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; consentId: string };
    expect(data.ok).toBe(true);
    expect(data.consentId).toBeTruthy();

    // Verify consent was actually persisted under tenant-a.
    const persisted = await consentRepository.get("tenant-a", data.consentId);
    expect(persisted).not.toBeNull();
    expect(persisted!.patientId).toBe("pt-9001");
    expect(persisted!.kind).toBe("hipaa");
    expect(persisted!.version).toBe("2.1");
    expect(persisted!.signedAt).toBe("2025-12-01T00:00:00Z");
  });

  it("rejects an invalid signature with 401 and does not persist", async () => {
    setEnv("DOCUSIGN_HMAC_KEY", HMAC_KEY);
    const rawBody = JSON.stringify({ event: "envelope-completed", data: {} });

    const { context } = makeContext({});
    const request = makeWebhookRequest({
      body: rawBody,
      signature: "WRONG-SIGNATURE",
      tenantHeader: "tenant-a",
    });
    const res = await webhookDocusign(request, context);
    expect(res.status).toBe(401);
    const page = await consentRepository.list("tenant-a", { limit: 5 });
    expect(page.items).toHaveLength(0);
  });

  it("rejects a missing signature with 401", async () => {
    setEnv("DOCUSIGN_HMAC_KEY", HMAC_KEY);
    const rawBody = JSON.stringify({ event: "envelope-completed", data: {} });

    const { context } = makeContext({});
    const request = makeWebhookRequest({
      body: rawBody,
      signature: null,
      tenantHeader: "tenant-a",
    });
    const res = await webhookDocusign(request, context);
    expect(res.status).toBe(401);
  });

  it("acks unknown event types with 200 and ignored marker", async () => {
    setEnv("DOCUSIGN_HMAC_KEY", HMAC_KEY);
    const payload = { event: "envelope-sent", data: { envelopeId: "x" } };
    const rawBody = JSON.stringify(payload);
    const sig = await signBody(rawBody, HMAC_KEY);

    const { context } = makeContext({});
    const request = makeWebhookRequest({
      body: rawBody,
      signature: sig,
      tenantHeader: "tenant-a",
    });
    const res = await webhookDocusign(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; ignored?: string };
    expect(data.ok).toBe(true);
    expect(data.ignored).toBe("envelope-sent");

    // No consent persisted for unknown event.
    const page = await consentRepository.list("tenant-a", { limit: 5 });
    expect(page.items).toHaveLength(0);
  });

  it("returns 400 when envelope-completed is missing patientId/consentKind tabs", async () => {
    setEnv("DOCUSIGN_HMAC_KEY", HMAC_KEY);
    const payload = {
      event: "envelope-completed",
      data: {
        envelopeId: "env-2",
        envelopeSummary: {
          recipients: { signers: [{ tabs: { textTabs: [] } }] },
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const sig = await signBody(rawBody, HMAC_KEY);

    const { context } = makeContext({});
    const request = makeWebhookRequest({
      body: rawBody,
      signature: sig,
      tenantHeader: "tenant-a",
    });
    const res = await webhookDocusign(request, context);
    expect(res.status).toBe(400);
  });
});

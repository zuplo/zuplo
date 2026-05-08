import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import datadogWebhookHandler from "../modules/handlers/datadog-webhook.ts";
import { evidenceRepository } from "../modules/repositories/evidence.ts";

const ENV_KEYS = [
  "DATADOG_WEBHOOK_SECRET",
  "NODE_ENV",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
];
function clearEnv() {
  for (const key of ENV_KEYS) {
    delete (environment as Record<string, string | undefined>)[key];
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  clearEnv();
  for (const tenant of ["tenant-a", "tenant-b"]) {
    const page = await evidenceRepository.list(tenant, { limit: 1000 });
    for (const item of page.items) {
      await evidenceRepository.delete(tenant, item.id).catch(() => {});
    }
  }
});

async function hmacHex(secret: string, body: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DD_PAYLOAD = {
  alertId: "DD-1",
  alertType: "error",
  alertStatus: "Triggered",
  title: "Backups failing",
  body: "Last 3 runs failed",
  monitorName: "Backups",
  tags: ["control:CC6.1", "env:prod"],
  metricName: "backup.success",
  eventTime: 1716422400,
};

describe("POST /webhooks/datadog", () => {
  it("creates an evidence row and uploads raw body to R2 on valid signature", async () => {
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    environment.R2_ACCOUNT_ID = "acct";
    environment.R2_ACCESS_KEY_ID = "AKIATEST";
    environment.R2_SECRET_ACCESS_KEY = "supersecret";
    environment.R2_BUCKET = "evidence";

    const body = JSON.stringify(DD_PAYLOAD);
    const sig = await hmacHex("secret", body);

    // Mock R2 PUT
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/datadog",
      method: "POST",
      rawBody: body,
      tenantId: "tenant-a",
      headers: {
        "x-datadog-signature": sig,
        "content-type": "application/json",
      },
    });
    const response = await datadogWebhookHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      ok: boolean;
      evidenceId: string;
      controlId: string;
    };
    expect(data.ok).toBe(true);
    expect(data.controlId).toBe("CC6.1");

    const ev = await evidenceRepository.get("tenant-a", data.evidenceId);
    expect(ev?.kind).toBe("log");
    expect(ev?.controlId).toBe("CC6.1");
    expect(ev?.collectedBy).toBe("datadog-webhook");

    // R2 was called for upload.
    expect(fetchMock).toHaveBeenCalled();
    const [r2Url] = fetchMock.mock.calls[0]!;
    expect(String(r2Url)).toContain("acct.r2.cloudflarestorage.com");
  });

  it("rejects invalid signature with 401", async () => {
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    const body = JSON.stringify(DD_PAYLOAD);
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/datadog",
      method: "POST",
      rawBody: body,
      tenantId: "tenant-a",
      headers: {
        "x-datadog-signature": "deadbeef",
        "content-type": "application/json",
      },
    });
    const response = await datadogWebhookHandler(request, context);
    expect(response.status).toBe(401);

    const evidence = await evidenceRepository.list("tenant-a", { limit: 100 });
    expect(evidence.items.length).toBe(0);
  });

  it("acks 200 without creating evidence when no control:* tag", async () => {
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    const payload = { ...DD_PAYLOAD, tags: ["env:prod"] };
    const body = JSON.stringify(payload);
    const sig = await hmacHex("secret", body);

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/datadog",
      method: "POST",
      rawBody: body,
      tenantId: "tenant-a",
      headers: {
        "x-datadog-signature": sig,
        "content-type": "application/json",
      },
    });
    const response = await datadogWebhookHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean; ignored: boolean };
    expect(data.ok).toBe(true);
    expect(data.ignored).toBe(true);

    const evidence = await evidenceRepository.list("tenant-a", { limit: 100 });
    expect(evidence.items.length).toBe(0);
  });

  it("returns 400 on invalid JSON body", async () => {
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    const body = "not json";
    const sig = await hmacHex("secret", body);
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/datadog",
      method: "POST",
      rawBody: body,
      tenantId: "tenant-a",
      headers: {
        "x-datadog-signature": sig,
        "content-type": "application/json",
      },
    });
    const response = await datadogWebhookHandler(request, context);
    expect(response.status).toBe(400);
  });
});

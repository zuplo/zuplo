import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import datadogWebhookHandler from "../modules/handlers/datadog-webhook.ts";
import { incidentRepository } from "../modules/repositories/incidents.ts";
import { incidentUpdateRepository } from "../modules/repositories/incident-updates.ts";
import { componentRepository } from "../modules/repositories/components.ts";
import { subscriberRepository } from "../modules/repositories/subscribers.ts";

const ENV_KEYS = [
  "DATADOG_WEBHOOK_SECRET",
  "NODE_ENV",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
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
    for (const repo of [
      incidentRepository,
      incidentUpdateRepository,
      componentRepository,
      subscriberRepository,
    ]) {
      const page = await repo.list(tenant, { limit: 1000 });
      for (const item of page.items) {
        await repo.delete(tenant, item.id).catch(() => {});
      }
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
  title: "API errors",
  body: "Something broke",
  monitorName: "api-errors",
  tags: ["component:api", "severity:major"],
  eventTime: 1716422400,
};

describe("POST /webhooks/datadog (status-page)", () => {
  it("creates an incident with status investigating from a Triggered alert", async () => {
    const tenant = "tenant-a";
    environment.DATADOG_WEBHOOK_SECRET = "secret";
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";

    await componentRepository.create(tenant, {
      slug: "api",
      name: "API",
      status: "operational",
      description: "x",
      parentSlug: null,
      displayOrder: 1,
      updatedAt: "2026-05-01T00:00:00.000Z",
    });

    const body = JSON.stringify(DD_PAYLOAD);
    const sig = await hmacHex("secret", body);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
    );

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/datadog",
      method: "POST",
      rawBody: body,
      tenantId: tenant,
      headers: {
        "x-datadog-signature": sig,
        "content-type": "application/json",
      },
    });
    const response = await datadogWebhookHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      action: string;
      incidentId: string;
    };
    expect(data.action).toBe("created");

    const incident = await incidentRepository.get(tenant, data.incidentId);
    expect(incident?.status).toBe("investigating");
    expect(incident?.impact).toBe("major");
    expect(incident?.affectedComponentSlugs).toEqual(["api"]);

    // Component bumped to partial_outage (severity major).
    const comps = await componentRepository.list(tenant, { limit: 100 });
    expect(comps.items[0].status).toBe("partial_outage");
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

    const incidents = await incidentRepository.list("tenant-a", {
      limit: 100,
    });
    expect(incidents.items.length).toBe(0);
  });

  it("resolves an existing incident on a Recovered alert", async () => {
    const tenant = "tenant-a";
    environment.DATADOG_WEBHOOK_SECRET = "secret";

    // Pre-create matching incident keyed by `dd:DD-1`.
    await incidentRepository.create(tenant, {
      title: "API errors",
      body: "dd:DD-1 — Something broke",
      status: "investigating",
      impact: "major",
      affectedComponentSlugs: ["api"],
      startedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      kind: "incident",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    const recovered = {
      ...DD_PAYLOAD,
      alertStatus: "Recovered" as const,
      title: "API errors",
    };
    const body = JSON.stringify(recovered);
    const sig = await hmacHex("secret", body);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/datadog",
      method: "POST",
      rawBody: body,
      tenantId: tenant,
      headers: {
        "x-datadog-signature": sig,
        "content-type": "application/json",
      },
    });
    const response = await datadogWebhookHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { action: string };
    expect(data.action).toBe("resolved");

    const incidents = await incidentRepository.list(tenant, { limit: 100 });
    expect(incidents.items[0].status).toBe("resolved");
    expect(incidents.items[0].resolvedAt).toBeTruthy();

    // An auto-resolution timeline update should have been created.
    const updates = await incidentUpdateRepository.list(tenant, { limit: 100 });
    expect(updates.items.length).toBe(1);
    expect(updates.items[0].status).toBe("resolved");
  });

  it("returns 'ignored' for duplicate Triggered when an incident already exists", async () => {
    const tenant = "tenant-a";
    environment.DATADOG_WEBHOOK_SECRET = "secret";

    await incidentRepository.create(tenant, {
      title: "API errors",
      body: "dd:DD-1 — duplicate prevention",
      status: "investigating",
      impact: "major",
      affectedComponentSlugs: ["api"],
      startedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      kind: "incident",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    const body = JSON.stringify(DD_PAYLOAD);
    const sig = await hmacHex("secret", body);

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/datadog",
      method: "POST",
      rawBody: body,
      tenantId: tenant,
      headers: {
        "x-datadog-signature": sig,
        "content-type": "application/json",
      },
    });
    const response = await datadogWebhookHandler(request, context);
    const data = (await response.json()) as { action: string };
    expect(data.action).toBe("ignored");
  });

  it("returns 400 on invalid JSON", async () => {
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

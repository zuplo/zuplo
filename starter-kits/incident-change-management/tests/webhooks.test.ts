import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import pagerdutyWebhookHandler from "../modules/handlers/pagerduty-webhook.ts";
import { incidentRepository } from "../modules/repositories/incidents.ts";

const ENV_KEYS = [
  "PAGERDUTY_WEBHOOK_SECRET",
  "NODE_ENV",
  "SLACK_BOT_TOKEN",
  "SLACK_WEBHOOK_URL",
  "SLACK_INCIDENT_CHANNEL",
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
    const page = await incidentRepository.list(tenant, { limit: 1000 });
    for (const item of page.items) {
      await incidentRepository.delete(tenant, item.id).catch(() => {});
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

const TRIGGERED_PAYLOAD = {
  event: {
    id: "evt-1",
    event_type: "incident.triggered",
    resource_type: "incident",
    occurred_at: "2026-05-01T00:00:00Z",
    agent: { id: "a", type: "user" },
    data: {
      id: "PD-INC-1",
      type: "incident",
      self: "https://api.pagerduty.com/incidents/PD-INC-1",
      html_url: "https://example.pagerduty.com/incidents/PD-INC-1",
      number: 1,
      status: "triggered",
      incident_key: "k1",
      title: "Database slow",
      service: {
        id: "S1",
        summary: "Database",
        html_url: "https://example.pagerduty.com/services/S1",
      },
      assignees: [{ id: "U1", summary: "alice@example.com" }],
      escalation_policy: { id: "EP1", summary: "Default" },
      urgency: "high",
      created_at: "2026-05-01T00:00:00Z",
    },
  },
};

describe("POST /webhooks/pagerduty", () => {
  it("creates an incident from a triggered event with a valid signature, then fans out to Slack", async () => {
    environment.PAGERDUTY_WEBHOOK_SECRET = "secret";
    environment.SLACK_WEBHOOK_URL = "https://hooks.slack.com/x";
    const body = JSON.stringify(TRIGGERED_PAYLOAD);
    const sig = await hmacHex("secret", body);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/pagerduty",
      method: "POST",
      rawBody: body,
      tenantId: "tenant-a",
      headers: {
        "x-pagerduty-signature": `v1=${sig}`,
        "content-type": "application/json",
      },
    });

    const response = await pagerdutyWebhookHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { action: string; incidentId: string };
    expect(data.action).toBe("created");
    expect(data.incidentId).toBeTruthy();

    const incidents = await incidentRepository.list("tenant-a", {
      limit: 100,
    });
    expect(incidents.items.length).toBe(1);
    expect(incidents.items[0].title).toBe("Database slow");
    expect(incidents.items[0].severity).toBe("sev1");

    // Slack got pinged
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]![0])).toContain("hooks.slack.com");
  });

  it("rejects invalid signature with 401", async () => {
    environment.PAGERDUTY_WEBHOOK_SECRET = "secret";
    const body = JSON.stringify(TRIGGERED_PAYLOAD);

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/pagerduty",
      method: "POST",
      rawBody: body,
      tenantId: "tenant-a",
      headers: {
        "x-pagerduty-signature": "v1=00000000",
        "content-type": "application/json",
      },
    });

    const response = await pagerdutyWebhookHandler(request, context);
    expect(response.status).toBe(401);

    const incidents = await incidentRepository.list("tenant-a", {
      limit: 100,
    });
    expect(incidents.items.length).toBe(0);
  });

  it("acks unknown event types without crashing", async () => {
    environment.PAGERDUTY_WEBHOOK_SECRET = "secret";
    const payload = {
      event: {
        ...TRIGGERED_PAYLOAD.event,
        event_type: "incident.something_unhandled",
      },
    };
    const body = JSON.stringify(payload);
    const sig = await hmacHex("secret", body);
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/pagerduty",
      method: "POST",
      rawBody: body,
      tenantId: "tenant-a",
      headers: {
        "x-pagerduty-signature": `v1=${sig}`,
        "content-type": "application/json",
      },
    });
    const response = await pagerdutyWebhookHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean; action: string };
    expect(data.ok).toBe(true);
    expect(data.action).toBe("ignored");

    const incidents = await incidentRepository.list("tenant-a", {
      limit: 100,
    });
    expect(incidents.items.length).toBe(0);
  });

  it("handles incident.resolved by updating status and fanning out", async () => {
    environment.PAGERDUTY_WEBHOOK_SECRET = "secret";
    environment.SLACK_WEBHOOK_URL = "https://hooks.slack.com/x";

    // Pre-create the incident keyed on the same PD id.
    const tenant = "tenant-a";
    await incidentRepository.create(tenant, {
      title: "Database slow",
      description: `pd:PD-INC-1 — Database`,
      severity: "sev1",
      status: "investigating",
      commanderEmail: "alice@example.com",
      declaredAt: "2026-05-01T00:00:00Z",
      resolvedAt: null,
      affectedServices: ["Database"],
      rootCause: null,
    });

    const resolvedPayload = {
      event: {
        ...TRIGGERED_PAYLOAD.event,
        event_type: "incident.resolved",
        data: {
          ...TRIGGERED_PAYLOAD.event.data,
          status: "resolved",
          resolved_at: "2026-05-01T01:00:00Z",
        },
      },
    };
    const body = JSON.stringify(resolvedPayload);
    const sig = await hmacHex("secret", body);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/pagerduty",
      method: "POST",
      rawBody: body,
      tenantId: tenant,
      headers: {
        "x-pagerduty-signature": `v1=${sig}`,
        "content-type": "application/json",
      },
    });
    const response = await pagerdutyWebhookHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { action: string };
    expect(data.action).toBe("updated");

    const incidents = await incidentRepository.list(tenant, { limit: 100 });
    expect(incidents.items[0].status).toBe("resolved");
    expect(incidents.items[0].resolvedAt).toBe("2026-05-01T01:00:00Z");
  });

  it("returns 400 on invalid JSON", async () => {
    environment.PAGERDUTY_WEBHOOK_SECRET = "secret";
    const body = "{ not json";
    const sig = await hmacHex("secret", body);
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/pagerduty",
      method: "POST",
      rawBody: body,
      tenantId: "tenant-a",
      headers: {
        "x-pagerduty-signature": `v1=${sig}`,
        "content-type": "application/json",
      },
    });
    const response = await pagerdutyWebhookHandler(request, context);
    expect(response.status).toBe(400);
  });
});

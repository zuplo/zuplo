import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import postmarkInboundHandler from "../modules/handlers/postmark-inbound.ts";
import { ticketRepository } from "../modules/repositories/tickets.ts";

const ENV_KEYS = [
  "POSTMARK_WEBHOOK_USERNAME",
  "POSTMARK_WEBHOOK_PASSWORD",
  "NODE_ENV",
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
    const page = await ticketRepository.list(tenant, { limit: 1000 });
    for (const item of page.items) {
      await ticketRepository.delete(tenant, item.id).catch(() => {});
    }
  }
});

const VALID_INBOUND = {
  MessageID: "abcd-1234",
  From: "alice@example.com",
  FromFull: { Email: "alice@example.com", Name: "Alice" },
  To: "support@example.com",
  ToFull: [{ Email: "support@example.com" }],
  Subject: "Help me, please",
  TextBody: "Something is broken",
  StrippedTextReply: "Something is broken",
  HtmlBody: "<p>Something is broken</p>",
  Date: "2026-05-01T00:00:00Z",
};

describe("POST /webhooks/postmark/inbound", () => {
  it("creates a ticket from a valid signed inbound email", async () => {
    environment.POSTMARK_WEBHOOK_USERNAME = "user";
    environment.POSTMARK_WEBHOOK_PASSWORD = "pass";
    const auth = `Basic ${btoa("user:pass")}`;

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/webhooks/postmark/inbound",
      method: "POST",
      body: VALID_INBOUND,
      tenantId: "tenant-a",
      headers: { authorization: auth },
    });

    const response = await postmarkInboundHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      ok: boolean;
      ticketId: string;
    };
    expect(data.ok).toBe(true);

    const ticket = await ticketRepository.get("tenant-a", data.ticketId);
    expect(ticket).not.toBeNull();
    expect(ticket?.customerEmail).toBe("alice@example.com");
    expect(ticket?.subject).toBe("Help me, please");
    expect(ticket?.body).toContain("Something is broken");
    expect(ticket?.channel).toBe("email");
    expect(ticket?.status).toBe("new");
  });

  it("rejects request with missing or invalid Basic auth", async () => {
    environment.POSTMARK_WEBHOOK_USERNAME = "user";
    environment.POSTMARK_WEBHOOK_PASSWORD = "pass";
    const { context } = makeContext({});

    const noAuth = makeRequest({
      url: "https://kit.test/webhooks/postmark/inbound",
      method: "POST",
      body: VALID_INBOUND,
      tenantId: "tenant-a",
    });
    const r1 = await postmarkInboundHandler(noAuth, context);
    expect(r1.status).toBe(401);

    const badAuth = makeRequest({
      url: "https://kit.test/webhooks/postmark/inbound",
      method: "POST",
      body: VALID_INBOUND,
      tenantId: "tenant-a",
      headers: { authorization: `Basic ${btoa("user:wrong")}` },
    });
    const r2 = await postmarkInboundHandler(badAuth, context);
    expect(r2.status).toBe(401);

    // No ticket should have been created
    const tickets = await ticketRepository.list("tenant-a", { limit: 100 });
    expect(tickets.items.length).toBe(0);
  });

  it("falls back to TextBody when StrippedTextReply is missing", async () => {
    environment.POSTMARK_WEBHOOK_USERNAME = "user";
    environment.POSTMARK_WEBHOOK_PASSWORD = "pass";
    const { context } = makeContext({});
    const auth = `Basic ${btoa("user:pass")}`;

    const inbound = { ...VALID_INBOUND, StrippedTextReply: "" };
    const request = makeRequest({
      url: "https://kit.test/webhooks/postmark/inbound",
      method: "POST",
      body: inbound,
      tenantId: "tenant-a",
      headers: { authorization: auth },
    });
    const response = await postmarkInboundHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { ticketId: string };
    const ticket = await ticketRepository.get("tenant-a", data.ticketId);
    expect(ticket?.body).toBe("Something is broken");
  });

  it("uses a default subject when none provided", async () => {
    environment.POSTMARK_WEBHOOK_USERNAME = "user";
    environment.POSTMARK_WEBHOOK_PASSWORD = "pass";
    const { context } = makeContext({});
    const auth = `Basic ${btoa("user:pass")}`;

    const inbound = { ...VALID_INBOUND, Subject: "" };
    const request = makeRequest({
      url: "https://kit.test/webhooks/postmark/inbound",
      method: "POST",
      body: inbound,
      tenantId: "tenant-a",
      headers: { authorization: auth },
    });
    const response = await postmarkInboundHandler(request, context);
    const data = (await response.json()) as { ticketId: string };
    const ticket = await ticketRepository.get("tenant-a", data.ticketId);
    expect(ticket?.subject).toBe("(no subject)");
  });

  it("isolates tickets by tenant", async () => {
    environment.POSTMARK_WEBHOOK_USERNAME = "user";
    environment.POSTMARK_WEBHOOK_PASSWORD = "pass";
    const auth = `Basic ${btoa("user:pass")}`;
    const { context } = makeContext({});

    await postmarkInboundHandler(
      makeRequest({
        url: "https://kit.test/webhooks/postmark/inbound",
        method: "POST",
        body: VALID_INBOUND,
        tenantId: "tenant-a",
        headers: { authorization: auth },
      }),
      context,
    );
    await postmarkInboundHandler(
      makeRequest({
        url: "https://kit.test/webhooks/postmark/inbound",
        method: "POST",
        body: { ...VALID_INBOUND, Subject: "Tenant B issue" },
        tenantId: "tenant-b",
        headers: { authorization: auth },
      }),
      context,
    );

    const a = await ticketRepository.list("tenant-a", { limit: 100 });
    const b = await ticketRepository.list("tenant-b", { limit: 100 });
    expect(a.items.length).toBe(1);
    expect(b.items.length).toBe(1);
    expect(a.items[0].subject).toBe("Help me, please");
    expect(b.items[0].subject).toBe("Tenant B issue");
  });
});
